"""
Stream Service Application.
Exposes stream management endpoints and Server-Sent Events (SSE) live feed
for real-time streaming dashboard telemetry.
"""

import asyncio
from datetime import datetime, timezone
import json
import os
import queue
import sys
import uuid
from typing import List, Optional

from fastapi import FastAPI, Header, Query, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Gauge, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import (
    PlatformException, NotFoundException, AuthorizationException,
    AuthenticationException, ValidationException
)
from shared.logger import get_logger
from shared.models import StreamWindow, UserRole, AuditLogEntry
from shared.repository import Repository
from shared.security import decode_token, require_role
from src.simulator import simulator_instance

logger = get_logger("stream-service")

STREAM_EVENTS_TOTAL = Counter("stream_events_emitted_total", "Total simulated streaming events emitted")
ACTIVE_STREAM_CLIENTS = Gauge("stream_active_sse_clients", "Number of active SSE subscribers")


def get_current_user_context(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform Stream & Telemetry Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Stream service unhandled error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Stream service encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "stream-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "stream-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


class StreamStartRequest(BaseModel):
    dataset_id: str
    events_per_second: int = Field(5, ge=1, le=100)
    speed_multiplier: float = Field(1.0, ge=0.1, le=50.0)
    repeat_mode: bool = True


@app.post("/api/v1/stream/start")
def start_stream(
    payload: StreamStartRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    ds = Repository.get_dataset(payload.dataset_id)
    if not ds:
        raise NotFoundException("Dataset", payload.dataset_id, request_id=corr_id)

    simulator_instance.start(
        dataset_id=payload.dataset_id,
        events_per_sec=payload.events_per_second,
        speed_multiplier=payload.speed_multiplier,
        repeat_mode=payload.repeat_mode,
    )

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="STREAM_START",
            target_resource=f"dataset:{payload.dataset_id}",
            result="SUCCESS",
            status_code=200,
            request_id=corr_id,
            details={"events_per_second": payload.events_per_second},
        )
    )

    return {"message": f"Stream started for dataset '{payload.dataset_id}'", "status": simulator_instance.get_status()}


@app.post("/api/v1/stream/pause")
def pause_stream(
    authorization: Optional[str] = Header(None),
):
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    simulator_instance.pause()
    return {"message": "Stream paused", "status": simulator_instance.get_status()}


@app.post("/api/v1/stream/resume")
def resume_stream(
    authorization: Optional[str] = Header(None),
):
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    simulator_instance.resume()
    return {"message": "Stream resumed", "status": simulator_instance.get_status()}


@app.post("/api/v1/stream/stop")
def stop_stream(
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    simulator_instance.stop()

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="STREAM_STOP",
            target_resource="stream:simulator",
            result="SUCCESS",
            status_code=200,
            request_id=corr_id,
        )
    )
    return {"message": "Stream stopped", "status": simulator_instance.get_status()}


@app.get("/api/v1/stream/status")
def get_stream_status():
    return simulator_instance.get_status()


@app.get("/api/v1/stream/windows", response_model=List[StreamWindow])
def get_stream_windows(
    dataset_id: str = Query(..., description="Dataset ID"),
    limit: int = Query(30, ge=1, le=100),
):
    return Repository.get_recent_stream_windows(dataset_id, limit=limit)


@app.get("/api/v1/stream/live")
async def live_stream_feed(request: Request, token: Optional[str] = Query(None)):
    """
    Server-Sent Events (SSE) streaming endpoint.
    Transmits live smart meter readings and rolling window aggregates to UI dashboards.
    Accepts JWT authentication via ?token= query parameter or Authorization header.
    """
    auth_header = request.headers.get("Authorization")
    jwt_token = token
    if not jwt_token and auth_header and auth_header.startswith("Bearer "):
        jwt_token = auth_header.split(" ")[1]

    env = os.getenv("ENVIRONMENT", "development").lower()
    if env == "production" and not jwt_token:
        raise AuthenticationException("Authentication token required to subscribe to live telemetry stream.")
    if jwt_token:
        try:
            decode_token(jwt_token, expected_type="access")
        except Exception:
            raise AuthenticationException("Invalid or expired stream authorization token.")

    sub_queue = simulator_instance.register_subscriber()
    ACTIVE_STREAM_CLIENTS.inc()

    async def event_generator():
        try:
            while True:
                if await request.is_disconnected():
                    break

                try:
                    # Non-blocking pull from thread queue
                    data = sub_queue.get_nowait()
                    STREAM_EVENTS_TOTAL.inc()
                    json_payload = json.dumps(data)
                    # Yield as named telemetry event
                    yield {
                        "event": "telemetry",
                        "data": json_payload,
                    }
                except queue.Empty:
                    # Send heartbeat ping to prevent proxy connection timeouts
                    yield {
                        "event": "ping",
                        "data": json.dumps({"timestamp": datetime.now(timezone.utc).isoformat()}),
                    }
                    await asyncio.sleep(0.5)

        finally:
            simulator_instance.unregister_subscriber(sub_queue)
            ACTIVE_STREAM_CLIENTS.dec()

    return EventSourceResponse(event_generator())
