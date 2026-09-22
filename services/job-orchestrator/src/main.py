"""
Batch Job Orchestrator Microservice.
Provides asynchronous MapReduce execution, idempotent submission tracking,
real-time status polling, and failure recovery.
"""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import os
import sys
import uuid
from typing import List, Optional

from fastapi import FastAPI, Header, Request, Response, BackgroundTasks, status
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import (
    PlatformException, NotFoundException, AuthorizationException,
    AuthenticationException, ValidationException, ConflictException
)
from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import (
    AnalyticsJobCreate, AnalyticsJobResponse, JobStatus, UserRole, AuditLogEntry
)
from shared.repository import Repository
from shared.security import decode_token, require_role
from src.worker import execute_job_async

logger = get_logger("job-orchestrator")
hdfs_client = get_hdfs_client()
executor = ThreadPoolExecutor(max_workers=4)

JOB_SUBMISSIONS = Counter("job_submissions_total", "Total jobs submitted", ["job_type"])
JOB_LATENCY = Histogram("job_execution_duration_seconds", "Duration of MapReduce job execution")


def get_current_user_context(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform MapReduce Job Orchestrator",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Job orchestrator unhandled error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Job Orchestrator encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "job-orchestrator"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "job-orchestrator"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/jobs", response_model=AnalyticsJobResponse, status_code=status.HTTP_202_ACCEPTED)
def create_job(
    payload: AnalyticsJobCreate,
    background_tasks: BackgroundTasks,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    ds = Repository.get_dataset(payload.dataset_id)
    if not ds:
        raise NotFoundException("Dataset", payload.dataset_id, request_id=corr_id)

    # Input dataset must be preprocessed
    input_path = ds.cleaned_hdfs_path or f"/user/bda/energy/cleaned/{payload.dataset_id}/part-00000.csv"
    if not hdfs_client.file_exists(input_path):
        raise ValidationException(
            f"Dataset '{payload.dataset_id}' has not been preprocessed yet. Cleaned path missing.",
            request_id=corr_id,
        )

    # Idempotency check: deterministic run_id
    run_id = f"run_{payload.dataset_id}_{payload.job_type.value.lower()}_v{ds.version}"
    existing_jobs = Repository.list_jobs(dataset_id=payload.dataset_id)
    for ej in existing_jobs:
        if ej.run_id == run_id and ej.status in (JobStatus.RUNNING, JobStatus.QUEUED):
            raise ConflictException(f"Job with run ID '{run_id}' is already {ej.status.value}", request_id=corr_id)

    job_id = f"job_{uuid.uuid4().hex[:12]}"
    output_path = hdfs_client.get_output_path(payload.job_type.value, run_id)

    job_record = AnalyticsJobResponse(
        id=job_id,
        run_id=run_id,
        dataset_id=payload.dataset_id,
        job_type=payload.job_type,
        status=JobStatus.QUEUED,
        workspace_id=user.get("workspace_id", "default-workspace"),
        created_by=user["email"],
        input_path=input_path,
        output_path=output_path,
        progress_percent=0,
    )
    Repository.save_job(job_record)
    JOB_SUBMISSIONS.labels(job_type=payload.job_type.value).inc()

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="JOB_SUBMIT",
            target_resource=f"job:{job_id}",
            result="SUCCESS",
            status_code=202,
            request_id=corr_id,
            details={"job_type": payload.job_type.value, "dataset_id": payload.dataset_id},
        )
    )

    # Asynchronous job execution
    executor.submit(execute_job_async, job_id)

    return job_record


@app.get("/api/v1/jobs", response_model=List[AnalyticsJobResponse])
def list_jobs(
    dataset_id: Optional[str] = None,
    authorization: Optional[str] = Header(None),
):
    user = get_current_user_context(authorization)
    return Repository.list_jobs(dataset_id=dataset_id, workspace_id=user.get("workspace_id"))


@app.get("/api/v1/jobs/{job_id}", response_model=AnalyticsJobResponse)
def get_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    _user = get_current_user_context(authorization)
    job = Repository.get_job(job_id)
    if not job:
        raise NotFoundException("Analytics Job", job_id, request_id=corr_id)
    return job


@app.post("/api/v1/jobs/{job_id}/retry", response_model=AnalyticsJobResponse)
def retry_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    job = Repository.get_job(job_id)
    if not job:
        raise NotFoundException("Analytics Job", job_id, request_id=corr_id)

    if job.status not in (JobStatus.FAILED, JobStatus.CANCELLED):
        raise ConflictException(f"Cannot retry job in status '{job.status.value}'", request_id=corr_id)

    job.status = JobStatus.RETRYING
    job.retry_count += 1
    job.progress_percent = 0
    job.error_message = None
    Repository.save_job(job)

    executor.submit(execute_job_async, job_id)
    return job


@app.post("/api/v1/jobs/{job_id}/cancel", response_model=AnalyticsJobResponse)
def cancel_job(
    job_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN])

    job = Repository.get_job(job_id)
    if not job:
        raise NotFoundException("Analytics Job", job_id, request_id=corr_id)

    if job.status in (JobStatus.SUCCEEDED, JobStatus.FAILED):
        raise ConflictException(f"Cannot cancel job in terminal state '{job.status.value}'", request_id=corr_id)

    job.status = JobStatus.CANCELLED
    job.end_time = datetime.now(timezone.utc)
    Repository.save_job(job)
    return job
