"""
Integration tests for repository persistence, MongoDB schemas, and CRUD operations.
"""

import uuid

from shared.models import (
    AnalyticsJobResponse,
    DailyAggregate,
    DatasetMetadata,
    DatasetStatus,
    JobStatus,
    JobType,
    PeakEvent,
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


def _day(ds_id: str, date: str) -> DailyAggregate:
    return DailyAggregate(
        dataset_id=ds_id,
        date=date,
        total_consumption_kwh=10.0,
        average_power=1.0,
        minimum_power=0.1,
        maximum_power=3.0,
        sub_metering_1_total=1.0,
        sub_metering_2_total=2.0,
        sub_metering_3_total=3.0,
        reading_count=1440,
    )


def test_daily_limit_keeps_the_most_recent_days_in_date_order():
    ds_id = f"ds_lim_{uuid.uuid4().hex[:8]}"
    dates = [f"2026-01-{d:02d}" for d in range(1, 11)]
    # Saved out of order so the result's order comes from the read, not the write.
    Repository.save_daily_aggregates([_day(ds_id, d) for d in reversed(dates)])

    limited = Repository.get_daily_aggregates(ds_id, limit=3)
    assert [d.date for d in limited] == dates[-3:]

    everything = Repository.get_daily_aggregates(ds_id)
    assert [d.date for d in everything] == dates


def test_peak_event_count_is_the_total_not_the_page():
    ds_id = f"ds_peak_{uuid.uuid4().hex[:8]}"
    events = [
        PeakEvent(
            dataset_id=ds_id,
            timestamp=f"2026-01-01T00:{m:02d}:00",
            date="2026-01-01",
            hour=0,
            power=5.0 + m / 100,
            voltage=235.0,
            intensity=22.0,
            sub_metering_1=0.0,
            sub_metering_2=0.0,
            sub_metering_3=17.0,
            threshold_applied=4.0,
        )
        for m in range(60)
    ]
    Repository.save_peak_events(events)

    assert len(Repository.get_peak_events(ds_id)) == 50
    assert Repository.count_peak_events(ds_id) == 60
    assert Repository.count_peak_events("no_such_dataset") == 0
