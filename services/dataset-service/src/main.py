"""
Dataset and Ingestion Microservice.
Manages secure dataset ingestion, SHA-256 checksum verification,
schema structure validation, HDFS raw storage, and metadata lifecycle.
"""

import hashlib
import os
import shutil
import sys
import tempfile
import uuid
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Form, Header, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from pydantic import BaseModel

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import (
    PlatformException, ValidationException, NotFoundException,
    AuthorizationException, AuthenticationException
)
from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import (
    DatasetMetadata, DatasetStatus, UserRole, AuditLogEntry
)
from shared.repository import Repository
from shared.security import decode_token, require_role

logger = get_logger("dataset-service")
hdfs_client = get_hdfs_client()

DATASET_UPLOADS = Counter("dataset_uploads_total", "Total dataset uploads", ["status"])
UPLOAD_LATENCY = Histogram("dataset_upload_duration_seconds", "Duration of dataset ingestion")

EXPECTED_HEADERS = [
    "Date", "Time", "Global_active_power", "Global_reactive_power",
    "Voltage", "Global_intensity", "Sub_metering_1", "Sub_metering_2", "Sub_metering_3"
]

MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024  # 250 MB


def get_current_user_context(authorization: Optional[str] = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform Dataset Ingestion Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Dataset service unhandled error: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Dataset service encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "dataset-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "dataset-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/api/v1/datasets/upload", response_model=DatasetMetadata, status_code=status.HTTP_201_CREATED)
async def upload_dataset(
    file: UploadFile = File(...),
    workspace_id: Optional[str] = Form(None),
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    # Validate filename extension
    if not file.filename.endswith((".txt", ".csv")):
        raise ValidationException("Only .txt and .csv energy dataset files are supported", request_id=corr_id)

    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    hasher = hashlib.sha256()
    size_bytes = 0

    with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
        tmp_path = tmp_file.name
        first_line = None

        while chunk := await file.read(65536):
            size_bytes += len(chunk)
            if size_bytes > MAX_FILE_SIZE_BYTES:
                os.remove(tmp_path)
                raise ValidationException(f"Dataset exceeds maximum allowed size of 250MB", request_id=corr_id)
            hasher.update(chunk)
            tmp_file.write(chunk)

    # Validate schema from first line
    try:
        with open(tmp_path, "r", encoding="utf-8", errors="ignore") as f:
            first_line = f.readline().strip()

        delimiter = ";" if ";" in first_line else ","
        tokens = [t.strip() for t in first_line.split(delimiter)]
        if len(tokens) < 9:
            os.remove(tmp_path)
            raise ValidationException(
                f"Invalid dataset structure: Expected 9 features, detected {len(tokens)}",
                request_id=corr_id
            )

        # Upload to HDFS raw storage
        raw_hdfs_path = hdfs_client.upload_raw(dataset_id, tmp_path)

    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

    checksum = hasher.hexdigest()
    ws_id = workspace_id or user.get("workspace_id", "default-workspace")

    metadata = DatasetMetadata(
        id=dataset_id,
        filename=file.filename,
        size_bytes=size_bytes,
        checksum_sha256=checksum,
        version=1,
        status=DatasetStatus.UPLOADED,
        workspace_id=ws_id,
        created_by=user["email"],
        raw_hdfs_path=raw_hdfs_path,
    )

    Repository.save_dataset(metadata)
    DATASET_UPLOADS.labels(status="success").inc()

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="DATASET_UPLOAD",
            target_resource=f"dataset:{dataset_id}",
            result="SUCCESS",
            status_code=201,
            request_id=corr_id,
            details={"filename": file.filename, "size_bytes": size_bytes, "checksum": checksum},
        )
    )

    return metadata


class LocalImportRequest(BaseModel):
    file_path: str
    workspace_id: Optional[str] = "default-workspace"


BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
ALLOWED_IMPORT_DIRS = [os.path.realpath(DATA_DIR), os.path.realpath(BASE_DIR)]


@app.post("/api/v1/datasets/import-local", response_model=DatasetMetadata, status_code=status.HTTP_201_CREATED)
def import_local_dataset(
    payload: LocalImportRequest,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    """
    Secure endpoint for importing pre-staged official datasets or sample datasets.
    Protected against path traversal / LFI: restricted to allowlisted project directories.
    """
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])

    # Path traversal protection: resolve canonical path and check against allowlist
    real_target = os.path.realpath(payload.file_path)
    if not any(real_target == allowed or real_target.startswith(allowed + os.sep) for allowed in ALLOWED_IMPORT_DIRS):
        raise AuthorizationException(
            "Access denied: Local dataset import is restricted to authorized project and data directories.",
            request_id=corr_id
        )

    if not real_target.endswith((".txt", ".csv")):
        raise ValidationException("Only .txt and .csv energy dataset files are supported", request_id=corr_id)

    if not os.path.exists(real_target):
        raise NotFoundException("Dataset file on disk", real_target, request_id=corr_id)

    dataset_id = f"ds_{uuid.uuid4().hex[:12]}"
    hasher = hashlib.sha256()
    size_bytes = 0

    with open(real_target, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            size_bytes += len(chunk)
            hasher.update(chunk)

    checksum = hasher.hexdigest()
    raw_hdfs_path = hdfs_client.upload_raw(dataset_id, real_target)

    metadata = DatasetMetadata(
        id=dataset_id,
        filename=os.path.basename(real_target),
        size_bytes=size_bytes,
        checksum_sha256=checksum,
        version=1,
        status=DatasetStatus.UPLOADED,
        workspace_id=payload.workspace_id or user.get("workspace_id", "default-workspace"),
        created_by=user["email"],
        raw_hdfs_path=raw_hdfs_path,
    )

    Repository.save_dataset(metadata)
    DATASET_UPLOADS.labels(status="success").inc()

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="DATASET_LOCAL_IMPORT",
            target_resource=f"dataset:{dataset_id}",
            result="SUCCESS",
            status_code=201,
            request_id=corr_id,
            details={"file_path": real_target, "size_bytes": size_bytes},
        )
    )

    return metadata


@app.get("/api/v1/datasets", response_model=List[DatasetMetadata])
def list_datasets(
    authorization: Optional[str] = Header(None),
):
    user = get_current_user_context(authorization)
    return Repository.list_datasets(workspace_id=user.get("workspace_id"))


@app.get("/api/v1/datasets/{dataset_id}", response_model=DatasetMetadata)
def get_dataset(
    dataset_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    ds = Repository.get_dataset(dataset_id)
    if not ds:
        raise NotFoundException("Dataset", dataset_id, request_id=corr_id)

    # Multi-tenant workspace isolation enforcement
    if user.get("role") != UserRole.ADMIN.value and ds.workspace_id != user.get("workspace_id"):
        raise AuthorizationException("Access denied: Dataset does not belong to your workspace.", request_id=corr_id)

    return ds


@app.delete("/api/v1/datasets/{dataset_id}")
def delete_dataset(
    dataset_id: str,
    authorization: Optional[str] = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN])

    ds = Repository.get_dataset(dataset_id)
    if not ds:
        raise NotFoundException("Dataset", dataset_id, request_id=corr_id)

    if user.get("role") != UserRole.ADMIN.value and ds.workspace_id != user.get("workspace_id"):
        raise AuthorizationException("Access denied: Dataset does not belong to your workspace.", request_id=corr_id)


    deleted = Repository.delete_dataset(dataset_id)
    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="DATASET_DELETE",
            target_resource=f"dataset:{dataset_id}",
            result="SUCCESS" if deleted else "FAILURE",
            status_code=200,
            request_id=corr_id,
        )
    )
    return {"message": f"Dataset '{dataset_id}' deleted successfully", "deleted": deleted}
