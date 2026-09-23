"""
Analytics and Aggregation Microservice.
Serves processed Big Data read-models from MongoDB, computes real-time executive summaries,
and exports verified datasets in CSV and JSON formats.
"""

import csv
import io
import json
import os
import sys
import uuid

from fastapi import FastAPI, Header, Query, Request, Response
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, generate_latest

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import AuthenticationException, PlatformException
from shared.logger import get_logger
from shared.models import (
    AuditLogEntry,
    DailyAggregate,
    HourlyAggregate,
    JobStatus,
    MonthlyAggregate,
    PeakEvent,
    UserRole,
)
from shared.repository import Repository
from shared.security import decode_token, require_role

logger = get_logger("analytics-service")

ANALYTICS_REQUESTS = Counter("analytics_requests_total", "Total analytics API requests", ["view"])
EXPORT_COUNTER = Counter("analytics_exports_total", "Total analytical exports", ["format"])


def get_current_user_context(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or invalid Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    return payload.model_dump()


app = FastAPI(
    title="Energy Platform Analytics & Reporting Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Analytics service unhandled error: {exc!s}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "Analytics service encountered an internal error.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


@app.get("/health")
def health():
    return {"status": "UP", "service": "analytics-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "analytics-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/api/v1/analytics/daily", response_model=list[DailyAggregate])
def get_daily_analytics(
    dataset_id: str = Query(..., description="Dataset identifier"),
    limit: int = Query(365, ge=1, le=1500),
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    ANALYTICS_REQUESTS.labels(view="daily").inc()
    return Repository.get_daily_aggregates(dataset_id, limit=limit)


@app.get("/api/v1/analytics/hourly", response_model=list[HourlyAggregate])
def get_hourly_analytics(
    dataset_id: str = Query(..., description="Dataset identifier"),
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    ANALYTICS_REQUESTS.labels(view="hourly").inc()
    return Repository.get_hourly_aggregates(dataset_id)


@app.get("/api/v1/analytics/monthly", response_model=list[MonthlyAggregate])
def get_monthly_analytics(
    dataset_id: str = Query(..., description="Dataset identifier"),
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    ANALYTICS_REQUESTS.labels(view="monthly").inc()
    return Repository.get_monthly_aggregates(dataset_id)


@app.get("/api/v1/analytics/peak", response_model=list[PeakEvent])
def get_peak_analytics(
    dataset_id: str = Query(..., description="Dataset identifier"),
    limit: int = Query(50, ge=1, le=200),
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    ANALYTICS_REQUESTS.labels(view="peak").inc()
    return Repository.get_peak_events(dataset_id, limit=limit)


@app.get("/api/v1/analytics/submeters")
def get_submeter_comparison(
    dataset_id: str = Query(..., description="Dataset identifier"),
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    ANALYTICS_REQUESTS.labels(view="submeters").inc()
    # Aggregate across all available days without artificial truncations
    daily_items = Repository.get_daily_aggregates(dataset_id, limit=None)

    total_sub1 = sum(d.sub_metering_1_total for d in daily_items)
    total_sub2 = sum(d.sub_metering_2_total for d in daily_items)
    total_sub3 = sum(d.sub_metering_3_total for d in daily_items)
    total_sub = total_sub1 + total_sub2 + total_sub3 or 1.0

    return {
        "dataset_id": dataset_id,
        "kitchen_kwh": round(total_sub1 / 1000.0, 2),
        "laundry_kwh": round(total_sub2 / 1000.0, 2),
        "climate_kwh": round(total_sub3 / 1000.0, 2),
        "kitchen_percentage": round((total_sub1 / total_sub) * 100.0, 1),
        "laundry_percentage": round((total_sub2 / total_sub) * 100.0, 1),
        "climate_percentage": round((total_sub3 / total_sub) * 100.0, 1),
        "days_aggregated": len(daily_items),
    }


@app.get("/api/v1/analytics/overview")
def get_overview_summary(
    dataset_id: str | None = None,
    authorization: str | None = Header(None),
):
    _user = get_current_user_context(authorization)
    datasets = Repository.list_datasets()
    target_ds_id = dataset_id or (datasets[0].id if datasets else None)

    total_records = 0
    total_consumption_kwh = 0.0
    avg_power = 0.0
    max_peak_power = 0.0
    active_jobs = 0
    days_count = 0

    if target_ds_id:
        ds = Repository.get_dataset(target_ds_id)
        if ds and ds.quality_report:
            total_records = ds.quality_report.valid_rows
        # Retrieve full dataset history without artificial 365-day truncation
        daily = Repository.get_daily_aggregates(target_ds_id, limit=None)
        if daily:
            days_count = len(daily)
            total_consumption_kwh = round(sum(d.total_consumption_kwh for d in daily), 2)
            total_readings = sum(d.reading_count for d in daily)
            # Mathematically rigorous weighted average power: sum(avg_power * count) / total_readings
            avg_power = round(
                sum(d.average_power * d.reading_count for d in daily) / (total_readings or 1), 3
            )
            max_peak_power = round(max(d.maximum_power for d in daily), 3)

    jobs = Repository.list_jobs(dataset_id=target_ds_id)
    active_jobs = len([j for j in jobs if j.status in (JobStatus.RUNNING, JobStatus.QUEUED)])

    return {
        "dataset_id": target_ds_id,
        "total_records": total_records,
        "total_consumption_kwh": total_consumption_kwh,
        "total_energy_kwh": total_consumption_kwh,  # Compatibility alias
        "average_power_kw": avg_power,
        "peak_power_kw": max_peak_power,
        "active_jobs_count": active_jobs,
        "total_datasets": len(datasets),
        "days_aggregated": days_count,
    }


@app.get("/api/v1/analytics/metrics")
def get_bda_project_metrics(
    authorization: str | None = Header(None),
):
    """
    BDA Project Verification Metrics.
    Fulfills Requirement 65 by exposing total records, valid/invalid/missing row counts,
    processing durations, and execution performance stats for evaluation.
    """
    _user = get_current_user_context(authorization)
    datasets = Repository.list_datasets()
    jobs = Repository.list_jobs()

    total_raw_rows = 0
    total_valid_rows = 0
    total_rejected_rows = 0
    total_missing_rows = 0
    total_preprocess_duration = 0.0

    for ds in datasets:
        if ds.quality_report:
            total_raw_rows += ds.quality_report.total_input_rows
            total_valid_rows += ds.quality_report.valid_rows
            total_rejected_rows += ds.quality_report.rejected_rows
            total_missing_rows += ds.quality_report.missing_value_rows
            total_preprocess_duration += ds.quality_report.processing_duration_sec

    completed_jobs = [j for j in jobs if j.status == JobStatus.SUCCEEDED]
    avg_job_duration = (
        round(sum(j.duration_seconds or 0 for j in completed_jobs) / len(completed_jobs), 3)
        if completed_jobs else 0.0
    )

    return {
        "bda_pipeline_status": "OPERATIONAL",
        "total_datasets_tracked": len(datasets),
        "total_records_ingested": total_raw_rows,
        "valid_records_processed": total_valid_rows,
        "rejected_records_isolated": total_rejected_rows,
        "missing_question_mark_records": total_missing_rows,
        "total_preprocessing_duration_sec": round(total_preprocess_duration, 3),
        "total_batch_jobs_executed": len(completed_jobs),
        "average_job_duration_sec": avg_job_duration,
        "hdfs_storage_directories": [
            "/user/bda/energy/raw/",
            "/user/bda/energy/cleaned/",
            "/user/bda/energy/output/",
            "/user/bda/energy/rejected/"
        ],
        "supported_mapreduce_jobs": ["DAILY", "HOURLY", "MONTHLY", "PEAK"],
        "streaming_window_types": ["1-minute tumbling", "5-minute sliding"],
    }


@app.get("/api/v1/analytics/export")
def export_analytical_data(
    dataset_id: str = Query(..., description="Dataset ID"),
    export_type: str = Query("daily", pattern="^(daily|hourly|monthly|peak)$"),
    export_format: str = Query("csv", pattern="^(csv|json)$"),
    authorization: str | None = Header(None),
    request: Request = None,
):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else str(uuid.uuid4())
    user = get_current_user_context(authorization)
    require_role(UserRole(user["role"]), [UserRole.ADMIN, UserRole.ANALYST])
    EXPORT_COUNTER.labels(format=export_format).inc()

    if export_type == "daily":
        data = [d.model_dump(mode="json") for d in Repository.get_daily_aggregates(dataset_id)]
    elif export_type == "hourly":
        data = [d.model_dump(mode="json") for d in Repository.get_hourly_aggregates(dataset_id)]
    elif export_type == "monthly":
        data = [d.model_dump(mode="json") for d in Repository.get_monthly_aggregates(dataset_id)]
    else:
        data = [d.model_dump(mode="json") for d in Repository.get_peak_events(dataset_id)]

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=user["email"],
            action="ANALYTICS_EXPORT",
            target_resource=f"dataset:{dataset_id}:{export_type}",
            result="SUCCESS",
            status_code=200,
            request_id=corr_id,
            details={"format": export_format, "rows_exported": len(data)},
        )
    )

    filename = f"energy_{export_type}_{dataset_id}.{export_format}"

    if export_format == "json":
        return Response(
            content=json.dumps(data, indent=2),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        output = io.StringIO()
        if data:
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        return Response(
            content=output.getvalue(),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
