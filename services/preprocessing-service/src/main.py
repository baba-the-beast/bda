"""
Preprocessing and Data Quality Microservice.
Provides automated dataset sanitization, data quality assessment,
outlier characterization, and HDFS storage integration.
"""

import os
import sys
import tempfile
import uuid

from fastapi import FastAPI, Header, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from src.cleaner import preprocess_dataset

from shared.errors import AuthenticationException, NotFoundException, PlatformException, ValidationException
from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import AuditLogEntry, DataQualityReport, DatasetStatus, UserRole
from shared.repository import Repository
from shared.security import decode_token, require_role

logger = get_logger("preprocessing-service")
hdfs_client = get_hdfs_client()

PREPROCESS_JOBS = Counter("preprocess_jobs_total", "Total preprocessing jobs", ["status"])
PREPROCESS_LATENCY = Histogram("preprocess_duration_seconds", "Duration of dataset preprocessing")


def get_current_user_context(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform Preprocessing & Data Quality Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Preprocessing service unhandled error: {exc!s}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Preprocessing service encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "preprocessing-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "preprocessing-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/datasets/{dataset_id}/preprocess", response_model=DataQualityReport)
def trigger_preprocessing(
    dataset_id: str,
    authorization: str | None = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    ds = Repository.get_dataset(dataset_id)
    if not ds:
        raise NotFoundException("Dataset", dataset_id, request_id=corr_id)

    if not ds.raw_hdfs_path:
        raise ValidationException("Dataset does not have an associated raw HDFS path", request_id=corr_id)

    # Resolve local or cluster physical input
    raw_file_path = hdfs_client.get_local_path(ds.raw_hdfs_path)
    if not os.path.exists(raw_file_path):
        raise NotFoundException("Physical raw dataset file", raw_file_path, request_id=corr_id)

    # Update dataset status to PREPROCESSING
    ds.status = DatasetStatus.PREPROCESSING
    Repository.save_dataset(ds)

    with PREPROCESS_LATENCY.time():
        with tempfile.NamedTemporaryFile(suffix=".csv", delete=False) as clean_tmp, \
             tempfile.NamedTemporaryFile(suffix=".log", delete=False) as rej_tmp:
            clean_tmp_path = clean_tmp.name
            rej_tmp_path = rej_tmp.name

        try:
            quality_report = preprocess_dataset(
                input_file_path=raw_file_path,
                output_clean_path=clean_tmp_path,
                output_rejected_path=rej_tmp_path,
            )

            # Store cleaned and rejected files in HDFS
            cleaned_hdfs_path = hdfs_client.write_cleaned(dataset_id, clean_tmp_path)
            _rejected_hdfs_path = hdfs_client.write_rejected(dataset_id, rej_tmp_path)

            ds.cleaned_hdfs_path = cleaned_hdfs_path
            ds.status = DatasetStatus.PROCESSED
            ds.quality_report = quality_report
            Repository.save_dataset(ds)

            PREPROCESS_JOBS.labels(status="success").inc()

            Repository.log_audit_event(
                AuditLogEntry(
                    id=str(uuid.uuid4()),
                    actor=user["email"],
                    action="DATASET_PREPROCESS",
                    target_resource=f"dataset:{dataset_id}",
                    result="SUCCESS",
                    status_code=200,
                    request_id=corr_id,
                    details={
                        "valid_rows": quality_report.valid_rows,
                        "rejected_rows": quality_report.rejected_rows,
                        "duration_sec": quality_report.processing_duration_sec,
                    },
                )
            )

            return quality_report

        except Exception as e:
            ds.status = DatasetStatus.FAILED
            Repository.save_dataset(ds)
            PREPROCESS_JOBS.labels(status="failure").inc()
            logger.exception(f"Preprocessing failed for dataset {dataset_id}: {e!s}")
            raise ValidationException(f"Preprocessing failed: {e!s}", request_id=corr_id) from e
        finally:
            if os.path.exists(clean_tmp_path):
                os.remove(clean_tmp_path)
            if os.path.exists(rej_tmp_path):
                os.remove(rej_tmp_path)


@app.get("/api/v1/datasets/{dataset_id}/quality", response_model=DataQualityReport)
def get_data_quality_report(
    dataset_id: str,
    authorization: str | None = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    _user = get_current_user_context(authorization)
    ds = Repository.get_dataset(dataset_id)
    if not ds:
        raise NotFoundException("Dataset", dataset_id, request_id=corr_id)
    if not ds.quality_report:
        raise NotFoundException("Data quality report for dataset", dataset_id, request_id=corr_id)
    return ds.quality_report
