"""
Asynchronous Job Worker Engine.
Executes MapReduce batch processing jobs, parses output tuples,
and populates MongoDB analytical read-model collections.
"""

from datetime import datetime, timezone
import os
import sys
import time
from typing import List

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from jobs.mapreduce.runner import LocalStreamingPipelineRunner, HadoopStreamingRunner
from shared.engines.render_lite import RenderLiteAnalyticsEngine
from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import (
    AnalyticsJobResponse, DailyAggregate, HourlyAggregate, MonthlyAggregate,
    PeakEvent, JobStatus, JobType
)
from shared.repository import Repository

logger = get_logger("job-worker")
hdfs_client = get_hdfs_client()


def execute_job_async(job_id: str):
    job = Repository.get_job(job_id)
    if not job:
        logger.error(f"Cannot execute job {job_id}: record not found")
        return

    # Transition to RUNNING
    job.status = JobStatus.RUNNING
    job.start_time = datetime.now(timezone.utc)
    job.progress_percent = 10
    Repository.save_job(job)

    start_ts = time.time()

    try:
        # Determine physical input file from HDFS
        input_physical = hdfs_client.get_local_path(job.input_path)
        output_physical = hdfs_client.get_local_path(job.output_path)
        output_file = os.path.join(output_physical, "part-00000")

        logger.info(f"Starting MapReduce {job.job_type} job {job_id} on input: {input_physical}")

        # Choose runner based on mode
        bda_mode = os.getenv("BDA_MODE", "RENDER_LITE").upper()
        if bda_mode == "FULL_BDA" or os.getenv("HADOOP_MODE", "local") == "cluster":
            runner = HadoopStreamingRunner()
            success, message = runner.run_cluster_job(
                job_type=job.job_type.value,
                input_hdfs_path=job.input_path,
                output_hdfs_path=job.output_path,
            )
        else:
            engine = RenderLiteAnalyticsEngine()
            success, message = engine.run_job(
                job_type=job.job_type.value,
                input_path=input_physical,
                output_path=output_file,
            )

        if not success:
            raise RuntimeError(message)

        job.progress_percent = 70
        Repository.save_job(job)

        # Parse output file and persist read models to MongoDB
        _persist_mr_results_to_mongodb(job.dataset_id, job.job_type, output_file)

        duration = time.time() - start_ts
        job.status = JobStatus.SUCCEEDED
        job.end_time = datetime.now(timezone.utc)
        job.duration_seconds = round(duration, 3)
        job.progress_percent = 100
        job.error_message = None
        Repository.save_job(job)
        logger.info(f"MapReduce job {job_id} ({job.job_type}) succeeded in {duration:.2f}s")

    except Exception as e:
        duration = time.time() - start_ts
        job.status = JobStatus.FAILED
        job.end_time = datetime.now(timezone.utc)
        job.duration_seconds = round(duration, 3)
        job.error_message = str(e)
        job.progress_percent = 0
        Repository.save_job(job)
        logger.error(f"Job {job_id} failed: {str(e)}", exc_info=True)


def _persist_mr_results_to_mongodb(dataset_id: str, job_type: JobType, output_file_path: str):
    if not os.path.exists(output_file_path):
        raise FileNotFoundError(f"MapReduce output file not found at {output_file_path}")

    with open(output_file_path, "r", encoding="utf-8") as f:
        lines = [line.strip() for line in f if line.strip()]

    if job_type == JobType.DAILY:
        aggregates: List[DailyAggregate] = []
        for line in lines:
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            d_key, val_str = parts[0], parts[1]
            tokens = val_str.split(",")
            if len(tokens) != 8:
                continue
            aggregates.append(
                DailyAggregate(
                    dataset_id=dataset_id,
                    date=d_key,
                    total_consumption_kwh=float(tokens[0]),
                    average_power=float(tokens[1]),
                    minimum_power=float(tokens[2]),
                    maximum_power=float(tokens[3]),
                    sub_metering_1_total=float(tokens[4]),
                    sub_metering_2_total=float(tokens[5]),
                    sub_metering_3_total=float(tokens[6]),
                    reading_count=int(tokens[7]),
                )
            )
        Repository.save_daily_aggregates(aggregates)

    elif job_type == JobType.HOURLY:
        hourly_list: List[HourlyAggregate] = []
        for line in lines:
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            h_key, val_str = parts[0], parts[1]
            tokens = val_str.split(",")
            if len(tokens) != 5:
                continue
            hourly_list.append(
                HourlyAggregate(
                    dataset_id=dataset_id,
                    hour=int(h_key),
                    total_consumption_kwh=float(tokens[0]),
                    average_power=float(tokens[1]),
                    minimum_power=float(tokens[2]),
                    maximum_power=float(tokens[3]),
                    reading_count=int(tokens[4]),
                )
            )
        Repository.save_hourly_aggregates(hourly_list)

    elif job_type == JobType.MONTHLY:
        monthly_list: List[MonthlyAggregate] = []
        for line in lines:
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            m_key, val_str = parts[0], parts[1]
            tokens = val_str.split(",")
            if len(tokens) != 5:
                continue
            ym = m_key.split("-")
            monthly_list.append(
                MonthlyAggregate(
                    dataset_id=dataset_id,
                    year=int(ym[0]),
                    month=int(ym[1]),
                    total_consumption_kwh=float(tokens[0]),
                    average_power=float(tokens[1]),
                    minimum_power=float(tokens[2]),
                    maximum_power=float(tokens[3]),
                    reading_count=int(tokens[4]),
                )
            )
        Repository.save_monthly_aggregates(monthly_list)

    elif job_type == JobType.PEAK:
        peak_list: List[PeakEvent] = []
        for line in lines:
            parts = line.split("\t")
            if len(parts) != 2:
                continue
            period_key, val_str = parts[0], parts[1]
            tokens = val_str.split(",")
            if len(tokens) != 9:
                continue
            # tokens: ts, p, avg_p, v, intens, s1, s2, s3, count
            ts_str = tokens[0]
            # Parse timestamp
            try:
                dt = datetime.fromisoformat(ts_str.replace("Z", "+00:00"))
            except Exception:
                dt = datetime.now(timezone.utc)
            peak_list.append(
                PeakEvent(
                    dataset_id=dataset_id,
                    timestamp=dt,
                    date=dt.strftime("%Y-%m-%d"),
                    hour=dt.hour,
                    power=float(tokens[1]),
                    voltage=float(tokens[3]),
                    intensity=float(tokens[4]),
                    sub_metering_1=float(tokens[5]),
                    sub_metering_2=float(tokens[6]),
                    sub_metering_3=float(tokens[7]),
                    threshold_applied=4.0,
                )
            )
        Repository.save_peak_events(peak_list)
