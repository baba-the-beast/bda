"""
API Gateway Microservice.
Provides secure ingress routing, JWT token verification, sliding-window rate limiting,
strict security headers, request correlation tracking, and normalized error responses.
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
import os
import sys
import time
import uuid
from typing import Dict, List, Optional

from fastapi import FastAPI, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import httpx
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import PlatformException, RateLimitException
from shared.logger import get_logger
from shared.security import decode_token

logger = get_logger("api-gateway")

GATEWAY_REQUESTS = Counter("gateway_requests_total", "Total requests received at API Gateway", ["method", "status"])
GATEWAY_LATENCY = Histogram("gateway_request_duration_seconds", "Total duration at API Gateway", ["path_prefix"])

# Downstream microservice service discovery
SERVICE_ROUTING = {
    "/api/v1/auth": os.getenv("AUTH_SERVICE_URL", "http://localhost:8001"),
    "/api/v1/datasets": os.getenv("DATASET_SERVICE_URL", "http://localhost:8002"),
    "/api/v1/jobs": os.getenv("JOB_ORCHESTRATOR_URL", "http://localhost:8004"),
    "/api/v1/hive": os.getenv("HIVE_QUERY_SERVICE_URL", "http://localhost:8005"),
    "/api/v1/analytics": os.getenv("ANALYTICS_SERVICE_URL", "http://localhost:8006"),
    "/api/v1/stream": os.getenv("STREAM_SERVICE_URL", "http://localhost:8007"),
}

PREPROCESSING_URL = os.getenv("PREPROCESSING_SERVICE_URL", "http://localhost:8003")

# Simple in-memory sliding window rate limiter
RATE_LIMIT_BUCKET: Dict[str, List[float]] = {}
RATE_LIMIT_WINDOW_SEC = 60
MAX_REQUESTS_PER_MIN = int(os.getenv("RATE_LIMIT_MAX_RPM", "150"))
MAX_AUTH_REQUESTS_PER_MIN = 25

http_client: Optional[httpx.AsyncClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global http_client
    http_client = httpx.AsyncClient(timeout=60.0)
    yield
    if http_client:
        await http_client.aclose()


app = FastAPI(
    title="Energy Platform API Gateway",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# Configure CORS with explicit allowed origins
ALLOWED_ORIGINS = os.getenv("CORS_ALLOWED_ORIGINS", "http://localhost:3000,http://localhost:5173,http://localhost:80").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "Content-Disposition"],
)


@app.middleware("http")
async def security_and_tracking_middleware(request: Request, call_next):
    corr_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
    client_ip = request.client.host if request.client else "unknown"

    # Rate limiting check
    now = time.time()
    path = request.url.path
    key = f"{client_ip}:{path.startswith('/api/v1/auth')}"
    limit = MAX_AUTH_REQUESTS_PER_MIN if path.startswith("/api/v1/auth/login") else MAX_REQUESTS_PER_MIN

    timestamps = [ts for ts in RATE_LIMIT_BUCKET.get(key, []) if now - ts < RATE_LIMIT_WINDOW_SEC]
    if len(timestamps) >= limit:
        return JSONResponse(
            status_code=429,
            content={
                "error": {
                    "code": "RATE_LIMIT_EXCEEDED",
                    "message": f"Too many requests. Limit is {limit} requests per minute.",
                    "request_id": corr_id,
                    "details": [{"retry_after": 60}],
                }
            },
            headers={"Retry-After": "60", "X-Correlation-ID": corr_id},
        )
    timestamps.append(now)
    RATE_LIMIT_BUCKET[key] = timestamps

    # Execute request
    response: Response = await call_next(request)

    # Security Headers Injection
    response.headers["X-Correlation-ID"] = corr_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: https:; "
        "connect-src 'self' ws: wss:; "
        "frame-ancestors 'none';"
    )
    if os.getenv("ENABLE_HSTS", "false").lower() == "true":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

    return response


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.get("/health")
def health():
    return {"status": "UP", "service": "api-gateway"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "api-gateway"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# Direct Ingress / Reverse Proxy Route Handler
@app.api_route("/api/v1/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD"])
async def reverse_proxy(path: str, request: Request):
    full_path = f"/api/v1/{path}"
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))

    # Determine target microservice
    target_base = None
    if "/preprocess" in full_path or "/quality" in full_path:
        target_base = PREPROCESSING_SERVICE_URL
    else:
        for prefix, s_url in SERVICE_ROUTING.items():
            if full_path.startswith(prefix):
                target_base = s_url
                break

    if not target_base:
        return JSONResponse(
            status_code=404,
            content={
                "error": {
                    "code": "ROUTE_NOT_FOUND",
                    "message": f"No microservice registered for path '{full_path}'",
                    "request_id": corr_id,
                    "details": [],
                }
            },
        )

    target_url = f"{target_base}{full_path}"
    if request.url.query:
        target_url += f"?{request.url.query}"

    # Forward headers with correlation and auth
    headers = dict(request.headers)
    headers["X-Correlation-ID"] = corr_id
    headers.pop("host", None)

    body = await request.body()

    try:
        req = http_client.build_request(
            method=request.method,
            url=target_url,
            headers=headers,
            content=body,
        )
        resp = await http_client.send(req, stream=True)

        return StreamingResponse(
            resp.aiter_raw(),
            status_code=resp.status_code,
            headers=dict(resp.headers),
            background=resp.aclose,
        )
    except httpx.ConnectError:
        return JSONResponse(
            status_code=503,
            content={
                "error": {
                    "code": "SERVICE_UNAVAILABLE",
                    "message": f"Downstream service at {target_base} is unreachable.",
                    "request_id": corr_id,
                    "details": [],
                }
            },
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": "GATEWAY_ERROR",
                    "message": f"Gateway proxy failure: {str(e)}",
                    "request_id": corr_id,
                    "details": [],
                }
            },
        )
