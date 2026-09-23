"""
BDA Background Processing Daemon.
Dedicated worker process for RENDER_LITE / three-service Render deployment.
Continuously processes queued batch aggregation jobs and data quality workflows.
"""

import os
import sys
import time

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, BASE_DIR)

from services.job_orchestrator.src.worker import execute_job_async

from shared.logger import get_logger
from shared.models import JobStatus
from shared.repository import Repository

logger = get_logger("bda-processor-daemon")


def run_processor_loop(poll_interval_sec: float = 3.0):
    logger.info("Starting BDA Processor Background Worker Daemon...")
    bda_mode = os.getenv("BDA_MODE", "RENDER_LITE")
    logger.info(f"Processor operating in BDA_MODE={bda_mode}")

    while True:
        try:
            # Poll for queued jobs across all datasets
            queued_jobs = [j for j in Repository.list_jobs() if j.status == JobStatus.QUEUED]
            for job in queued_jobs:
                logger.info(f"Picking up queued job: {job.id} ({job.job_type}) for dataset {job.dataset_id}")
                execute_job_async(job.id)

        except Exception as e:
            logger.exception(f"Error in processor daemon loop: {e}")

        time.sleep(poll_interval_sec)


if __name__ == "__main__":
    run_processor_loop()
