"""
Integration tests for repository persistence, MongoDB schemas, and CRUD operations.
"""

import uuid
from datetime import datetime, timezone
import pytest
from shared.models import (
    DatasetMetadata, AnalyticsJobResponse, DailyAggregate,
    StreamWindow, JobStatus, JobType, DatasetStatus
)
from shared.repository import Repository


def test_dataset_repository_lifecycle():
    ds_id = f"test_ds_{uuid.uuid4().hex[:8]}"
    meta = DatasetMetadata(
        id=ds_id,
        filename="test_file.txt",
        size_bytes=1024,
        checksum_sha256="abc123sha256fake",
        status=DatasetStatus.UPLOADED,
    )
    Repository.save_dataset(meta)

    loaded = Repository.get_dataset(ds_id)
    assert loaded is not None
    assert loaded.id == ds_id
    assert loaded.filename == "test_file.txt"

    # Update status
    loaded.status = DatasetStatus.PROCESSED
    Repository.save_dataset(loaded)

    reloaded = Repository.get_dataset(ds_id)
    assert reloaded.status == DatasetStatus.PROCESSED

    # Delete
    assert Repository.delete_dataset(ds_id) is True
    assert Repository.get_dataset(ds_id) is None


def test_analytics_job_crud():
    job_id = f"test_job_{uuid.uuid4().hex[:8]}"
    job = AnalyticsJobResponse(
        id=job_id,
        run_id=f"run_{job_id}",
        dataset_id="test_ds",
        job_type=JobType.DAILY,
        status=JobStatus.QUEUED,
        workspace_id="ws_default",
        created_by="tester@bda.internal",
        input_path="/in",
        output_path="/out",
    )
    Repository.save_job(job)

    fetched = Repository.get_job(job_id)
    assert fetched is not None
    assert fetched.status == JobStatus.QUEUED

    fetched.status = JobStatus.RUNNING
    fetched.progress_percent = 50
    Repository.save_job(fetched)

    updated = Repository.get_job(job_id)
    assert updated.status == JobStatus.RUNNING
    assert updated.progress_percent == 50


def test_aggregates_storage():
    ds_id = f"ds_agg_{uuid.uuid4().hex[:8]}"
    daily = [
        DailyAggregate(
            dataset_id=ds_id,
            date="2026-01-01",
            total_consumption_kwh=15.5,
            average_power=2.1,
            minimum_power=0.4,
            maximum_power=5.8,
            sub_metering_1_total=100.0,
            sub_metering_2_total=200.0,
            sub_metering_3_total=300.0,
            reading_count=1440,
        )
    ]
    Repository.save_daily_aggregates(daily)
    results = Repository.get_daily_aggregates(ds_id)
    assert len(results) == 1
    assert results[0].date == "2026-01-01"
    assert results[0].total_consumption_kwh == 15.5
