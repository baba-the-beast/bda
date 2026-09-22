"""
Unit tests for Hadoop MapReduce mappers, reducers, and local streaming execution runner.
"""

import os
import tempfile
import pytest
from jobs.mapreduce.runner import LocalStreamingPipelineRunner


@pytest.fixture
def sample_cleaned_dataset():
    content = (
        "timestamp,global_active_power,global_reactive_power,voltage,global_intensity,sub_metering_1,sub_metering_2,sub_metering_3,date,hour,day,month,year\n"
        "2006-12-16T17:24:00Z,2.400,0.200,240.0,10.0,0.0,1.0,17.0,2006-12-16,17,16,12,2006\n"
        "2006-12-16T17:25:00Z,3.600,0.300,240.0,15.0,0.0,2.0,18.0,2006-12-16,17,16,12,2006\n"
        "2006-12-16T18:00:00Z,6.000,0.400,238.0,25.0,0.0,0.0,25.0,2006-12-16,18,16,12,2006\n"
        "2006-12-17T08:00:00Z,1.200,0.100,242.0,5.0,0.0,0.0,5.0,2006-12-17,8,17,12,2006\n"
    )
    with tempfile.NamedTemporaryFile("w", delete=False, suffix=".csv") as f:
        f.write(content)
        path = f.name

    yield path

    if os.path.exists(path):
        os.remove(path)


def test_daily_mapreduce_job(sample_cleaned_dataset):
    out_path = tempfile.mktemp(suffix=".txt")
    try:
        success, msg = LocalStreamingPipelineRunner.run_pipeline(
            "DAILY", sample_cleaned_dataset, out_path
        )
        assert success is True
        with open(out_path, "r") as f:
            lines = [l.strip() for l in f if l.strip()]

        assert len(lines) == 2  # 2 distinct dates: 2006-12-16 and 2006-12-17
        # First date: 2.4 + 3.6 + 6.0 = 12.0 kW total minutes -> 12.0 / 60 = 0.2000 kWh
        d1 = lines[0].split("\t")
        assert d1[0] == "2006-12-16"
        d1_vals = d1[1].split(",")
        assert float(d1_vals[0]) == pytest.approx(0.2000, abs=1e-4)  # total_kwh
        assert float(d1_vals[1]) == pytest.approx(4.0000, abs=1e-4)  # avg_power = 12.0 / 3
        assert int(d1_vals[7]) == 3  # reading count
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)


def test_hourly_mapreduce_job(sample_cleaned_dataset):
    out_path = tempfile.mktemp(suffix=".txt")
    try:
        success, msg = LocalStreamingPipelineRunner.run_pipeline(
            "HOURLY", sample_cleaned_dataset, out_path
        )
        assert success is True
        with open(out_path, "r") as f:
            lines = [l.strip() for l in f if l.strip()]

        assert len(lines) == 3  # hours 08, 17, 18
        hours = [l.split("\t")[0] for l in lines]
        assert "08" in hours
        assert "17" in hours
        assert "18" in hours
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)


def test_monthly_mapreduce_job(sample_cleaned_dataset):
    out_path = tempfile.mktemp(suffix=".txt")
    try:
        success, msg = LocalStreamingPipelineRunner.run_pipeline(
            "MONTHLY", sample_cleaned_dataset, out_path
        )
        assert success is True
        with open(out_path, "r") as f:
            lines = [l.strip() for l in f if l.strip()]

        assert len(lines) == 1  # 2006-12
        assert lines[0].startswith("2006-12")
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)


def test_peak_mapreduce_job(sample_cleaned_dataset):
    out_path = tempfile.mktemp(suffix=".txt")
    try:
        # Default threshold is 4.0 kW, row 3 has active power 6.000 kW
        success, msg = LocalStreamingPipelineRunner.run_pipeline(
            "PEAK", sample_cleaned_dataset, out_path, env_vars={"PEAK_THRESHOLD_KW": "4.0"}
        )
        assert success is True
        with open(out_path, "r") as f:
            lines = [l.strip() for l in f if l.strip()]

        assert len(lines) >= 1
        peak_entry = lines[0].split("\t")[1]
        assert "6.000" in peak_entry
    finally:
        if os.path.exists(out_path):
            os.remove(out_path)
