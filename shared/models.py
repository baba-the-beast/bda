"""
Core data models, analytical schemas, and request/response specifications
for the Energy Analytics Platform.
"""

from datetime import UTC, datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, EmailStr, Field


class UserRole(str, Enum):
    ADMIN = "ADMIN"
    ANALYST = "ANALYST"
    VIEWER = "VIEWER"


class JobType(str, Enum):
    DAILY = "DAILY"
    HOURLY = "HOURLY"
    MONTHLY = "MONTHLY"
    PEAK = "PEAK"


class JobStatus(str, Enum):
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    RETRYING = "RETRYING"


class DatasetStatus(str, Enum):
    UPLOADED = "UPLOADED"
    VALIDATING = "VALIDATING"
    VALIDATED = "VALIDATED"
    PREPROCESSING = "PREPROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


# ---------------------------------------------------------------------------
# Auth & User Models
# ---------------------------------------------------------------------------

class UserBase(BaseModel):
    email: EmailStr
    full_name: str
    role: UserRole = UserRole.ANALYST
    workspace_id: str = "default-workspace"
    is_active: bool = True


class UserCreate(UserBase):
    password: str = Field(..., min_length=8, description="Plaintext password")


class PublicRegistrationRequest(BaseModel):
    """Secure registration model preventing client-side privilege or workspace tampering."""
    email: EmailStr
    full_name: str
    password: str = Field(..., min_length=8, description="Plaintext password (min 8 chars)")


class SessionRecord(BaseModel):
    """Server-side active refresh token session tracking model for revocation."""
    id: str
    jti: str
    user_id: str
    email: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    expires_at: datetime
    is_revoked: bool = False


class UserResponse(UserBase):
    id: str
    created_at: datetime
    updated_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"  # noqa: S105
    expires_in: int = 900  # 15 minutes


class TokenPayload(BaseModel):
    sub: str
    email: str
    role: UserRole
    workspace_id: str
    exp: int
    iat: int
    jti: str



# ---------------------------------------------------------------------------
# Dataset & Preprocessing Models
# ---------------------------------------------------------------------------

class DataQualityReport(BaseModel):
    total_input_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    missing_value_rows: int = 0
    rejected_rows: int = 0
    processing_duration_sec: float = 0.0
    extreme_candidate_count: int = 0
    checksum_sha256: str = ""
    schema_version: str = "1.0.0"
    rejection_reasons: dict[str, int] = Field(default_factory=dict)


class DatasetMetadata(BaseModel):
    id: str
    filename: str
    size_bytes: int
    checksum_sha256: str
    version: int = 1
    status: DatasetStatus = DatasetStatus.UPLOADED
    workspace_id: str = "default-workspace"
    created_by: str = "system"
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    raw_hdfs_path: str | None = None
    cleaned_hdfs_path: str | None = None
    quality_report: DataQualityReport | None = None


class CleanEnergyRecord(BaseModel):
    timestamp: datetime
    global_active_power: float
    global_reactive_power: float
    voltage: float
    global_intensity: float
    sub_metering_1: float
    sub_metering_2: float
    sub_metering_3: float
    date: str  # YYYY-MM-DD
    hour: int  # 0 - 23
    day: int   # 1 - 31
    month: int # 1 - 12
    year: int  # YYYY


# ---------------------------------------------------------------------------
# Batch Job & Orchestration Models
# ---------------------------------------------------------------------------

class AnalyticsJobCreate(BaseModel):
    dataset_id: str
    job_type: JobType
    parameters: dict[str, Any] = Field(default_factory=dict)


class AnalyticsJobResponse(BaseModel):
    id: str
    run_id: str
    dataset_id: str
    job_type: JobType
    status: JobStatus
    workspace_id: str
    created_by: str
    start_time: datetime | None = None
    end_time: datetime | None = None
    duration_seconds: float | None = None
    input_path: str
    output_path: str
    retry_count: int = 0
    error_message: str | None = None
    progress_percent: int = 0
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Analytical Aggregate Schemas
# ---------------------------------------------------------------------------

class DailyAggregate(BaseModel):
    dataset_id: str
    dataset_version: int = 1
    date: str  # YYYY-MM-DD
    total_consumption_kwh: float
    average_power: float
    minimum_power: float
    maximum_power: float
    sub_metering_1_total: float
    sub_metering_2_total: float
    sub_metering_3_total: float
    reading_count: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class HourlyAggregate(BaseModel):
    dataset_id: str
    dataset_version: int = 1
    hour: int  # 0 - 23
    date: str | None = None  # Optional specific date
    total_consumption_kwh: float
    average_power: float
    minimum_power: float
    maximum_power: float
    reading_count: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class MonthlyAggregate(BaseModel):
    dataset_id: str
    dataset_version: int = 1
    year: int
    month: int
    total_consumption_kwh: float
    average_power: float
    minimum_power: float
    maximum_power: float
    reading_count: int
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class PeakEvent(BaseModel):
    dataset_id: str
    dataset_version: int = 1
    timestamp: datetime
    date: str
    hour: int
    power: float
    voltage: float
    intensity: float
    sub_metering_1: float
    sub_metering_2: float
    sub_metering_3: float
    threshold_applied: float
    calculation_version: str = "1.0.0"
    generated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


class StreamWindow(BaseModel):
    dataset_id: str
    window_start: datetime
    window_end: datetime
    average_power: float
    minimum_power: float
    maximum_power: float
    reading_count: int
    event_rate: float
    sub_metering_total: float
    # 1-minute tumbling window average; defaulted so documents written before this
    # field existed still deserialize.
    tumbling_average_power: float = 0.0
    recent_trend: str = "STABLE"  # RISING, FALLING, STABLE
    computed_at: datetime = Field(default_factory=lambda: datetime.now(UTC))


# ---------------------------------------------------------------------------
# Audit & Security Models
# ---------------------------------------------------------------------------

class AuditLogEntry(BaseModel):
    id: str
    actor: str
    action: str
    target_resource: str
    result: str  # SUCCESS / FAILURE
    status_code: int
    request_id: str | None = None
    ip_address: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))


class SecurityEventEntry(BaseModel):
    id: str
    event_type: str  # LOGIN_FAILED, BRUTE_FORCE_SUSPECT, TOKEN_REUSE, INJECTION_ATTEMPT
    severity: str    # LOW, MEDIUM, HIGH, CRITICAL
    actor: str | None = None
    ip_address: str | None = None
    request_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
