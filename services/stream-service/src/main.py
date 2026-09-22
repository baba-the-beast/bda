"""
Stream Service Application.
Exposes stream management endpoints and Server-Sent Events (SSE) live feed
for real-time streaming dashboard telemetry.
"""

import asyncio
import json
import os
import queue
import sys
import uuid
from datetime import UTC, datetime

from fastapi import FastAPI, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, generate_latest
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from src.simulator import simulator_instance

from shared.errors import AuthenticationException, NotFoundException, PlatformException
from shared.logger import get_logger
from shared.models import AuditLogEntry, StreamWindow, UserRole
from shared.repository import Repository
from shared.security import (
    STREAM_TICKET_EXPIRE_SECONDS,
    create_stream_ticket,
    decode_token,
    require_role,
)

logger = get_logger("stream-service")

STREAM_EVENTS_TOTAL = Counter("stream_events_emitted_total", "Total simulated streaming events emitted")
ACTIVE_STREAM_CLIENTS = Gauge("stream_active_sse_clients", "Number of active SSE subscribers")


def get_current_user_context(authorization: str | None = Header(None)) -> dict:
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
    logger.error(f"Stream service unhandled error: {exc!s}", exc_info=exc)
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


class StreamTicketResponse(BaseModel):
    ticket: str
    expires_in: int = Field(description="Ticket lifetime in seconds")


@app.post("/api/v1/stream/start")
def start_stream(
    payload: StreamStartRequest,
    authorization: str | None = Header(None),
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
    authorization: str | None = Header(None),
):
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    simulator_instance.pause()
    return {"message": "Stream paused", "status": simulator_instance.get_status()}


@app.post("/api/v1/stream/resume")
def resume_stream(
    authorization: str | None = Header(None),
):
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    simulator_instance.resume()
    return {"message": "Stream resumed", "status": simulator_instance.get_status()}


@app.post("/api/v1/stream/stop")
def stop_stream(
    authorization: str | None = Header(None),
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


@app.get("/api/v1/stream/windows", response_model=list[StreamWindow])
def get_stream_windows(
    dataset_id: str = Query(..., description="Dataset ID"),
    limit: int = Query(30, ge=1, le=100),
):
    return Repository.get_recent_stream_windows(dataset_id, limit=limit)


@app.post("/api/v1/stream/ticket", response_model=StreamTicketResponse)
def issue_stream_ticket(authorization: str | None = Header(None)):
    """
    Exchange a bearer access token for a short-lived, stream-only ticket.

    EventSource cannot send an Authorization header, so the credential must go in
    the URL, where it reaches access logs, proxies and browser history. Clients
    call this first and put the ticket there instead of their access token.
    """
    user = get_current_user_context(authorization)
    ticket = create_stream_ticket(
        user_id=user["sub"],
        email=user["email"],
        role=user["role"],
        workspace_id=user.get("workspace_id", "default-workspace"),
    )
    return StreamTicketResponse(ticket=ticket, expires_in=STREAM_TICKET_EXPIRE_SECONDS)


@app.get("/api/v1/stream/live")
async def live_stream_feed(
    request: Request,
    ticket: str | None = Query(None, description="Short-lived ticket from POST /stream/ticket"),
):
    """
    Server-Sent Events (SSE) streaming endpoint.
    Transmits live smart meter readings and rolling window aggregates to UI dashboards.
    Authenticates with a stream ticket (?ticket=) or an Authorization header.
    """
    auth_header = request.headers.get("Authorization")
    env = os.getenv("ENVIRONMENT", "development").lower()

    if ticket:
        try:
            decode_token(ticket, expected_type="stream")
        except Exception as e:
            raise AuthenticationException("Invalid or expired stream ticket.") from e
    elif auth_header and auth_header.startswith("Bearer "):
        try:
            decode_token(auth_header.split(" ")[1], expected_type="access")
        except Exception as e:
            raise AuthenticationException("Invalid or expired stream authorization token.") from e
    elif env == "production":
        raise AuthenticationException("A stream ticket is required to subscribe to live telemetry.")

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
                        "data": json.dumps({"timestamp": datetime.now(UTC).isoformat()}),
                    }
                    await asyncio.sleep(0.5)

        finally:
            simulator_instance.unregister_subscriber(sub_queue)
            ACTIVE_STREAM_CLIENTS.dec()

    return EventSourceResponse(event_generator())
