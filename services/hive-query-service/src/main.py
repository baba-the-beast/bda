"""
Hive Query Microservice.
Provides secure, parameterized execution of HiveQL analytical templates,
injection protection, query latency tracking, and tabular result sets.
"""

from datetime import datetime, timezone
import os
import sys
import uuid
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, Header, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import (
    PlatformException, NotFoundException, AuthorizationException,
    AuthenticationException, ValidationException
)
from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import UserRole, AuditLogEntry
from shared.repository import Repository
from shared.security import decode_token, require_role
from src.engine import APPROVED_TEMPLATES, execute_analytical_query, validate_query_safety

logger = get_logger("hive-query-service")
hdfs_client = get_hdfs_client()

HIVE_QUERIES = Counter("hive_queries_total", "Total Hive queries executed", ["template", "status"])
HIVE_LATENCY = Histogram("hive_query_duration_seconds", "Duration of Hive analytical queries", ["template"])


def get_current_user_context(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform Hive Query Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Hive query service unhandled error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Hive Query Service encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "hive-query-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "hive-query-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/hive/templates")
def list_query_templates():
    summaries = []
    for key, val in APPROVED_TEMPLATES.items():
        summaries.append({
            "id": key,
            "name": val["name"],
            "description": val["description"],
            "parameters": val["parameters"],
        })
    return summaries


class QueryExecutionRequest(BaseModel):
    dataset_id: str
    template_name: str
    parameters: Dict[str, Any] = Field(default_factory=dict)


class QueryExecutionResponse(BaseModel):
    query_id: str
    template_name: str
    dataset_id: str
    execution_duration_sec: float
    row_count: int
    columns: List[str]
    results: List[Dict[str, Any]]
    records: List[Dict[str, Any]] = Field(default_factory=list)  # Alias for frontend compatibility
    executed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@app.post("/api/v1/hive/queries/execute", response_model=QueryExecutionResponse)
def execute_query(
    payload: QueryExecutionRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER])

    ds = Repository.get_dataset(payload.dataset_id)
    if not ds:
        raise NotFoundException("Dataset", payload.dataset_id, request_id=corr_id)

    cleaned_hdfs = ds.cleaned_hdfs_path or f"/user/bda/energy/cleaned/{payload.dataset_id}/part-00000.csv"
    csv_physical_path = hdfs_client.get_local_path(cleaned_hdfs)
    if not os.path.exists(csv_physical_path):
        raise ValidationException(
            f"Cleaned dataset file does not exist on disk for dataset '{payload.dataset_id}'. Run preprocessing first.",
            request_id=corr_id
        )

    if payload.template_name not in APPROVED_TEMPLATES:
        raise ValidationException(
            f"Query template '{payload.template_name}' is not in the approved analytics whitelist.",
            request_id=corr_id
        )

    query_id = f"q_{uuid.uuid4().hex[:12]}"

    with HIVE_LATENCY.labels(template=payload.template_name).time():
        try:
            bda_mode = os.getenv("BDA_MODE", "RENDER_LITE").upper()
            if bda_mode == "FULL_BDA":
                from shared.engines.full_bda import HiveServerAnalyticsEngine
                hive_engine = HiveServerAnalyticsEngine()
                records, duration = hive_engine.execute_query(
                    payload.template_name,
                    csv_physical_path,
                    payload.parameters
                )
            else:
                records, duration = execute_analytical_query(
                    template_name=payload.template_name,
                    dataset_csv_path=csv_physical_path,
                    parameters=payload.parameters,
                )
            HIVE_QUERIES.labels(template=payload.template_name, status="success").inc()
        except Exception as e:
            HIVE_QUERIES.labels(template=payload.template_name, status="failure").inc()
            logger.error(f"Query {payload.template_name} failed: {str(e)}", exc_info=True)
            raise ValidationException(f"HiveQL query execution failed: {str(e)}", request_id=corr_id)

    columns = list(records[0].keys()) if records else []

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="HIVE_QUERY_EXECUTE",
            target_resource=f"query:{query_id}",
            result="SUCCESS",
            status_code=200,
            request_id=corr_id,
            details={
                "template": payload.template_name,
                "dataset_id": payload.dataset_id,
                "duration_sec": duration,
                "row_count": len(records),
            },
        )
    )

    return QueryExecutionResponse(
        query_id=query_id,
        template_name=payload.template_name,
        dataset_id=payload.dataset_id,
        execution_duration_sec=duration,
        row_count=len(records),
        columns=columns,
        results=records,
        records=records,
    )
