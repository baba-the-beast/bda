"""
Unit tests for Analytics Engines (RenderLite, DuckDB, FullBDA).
Verifies execution correctness, schema conformance, and fail-closed behaviors.
"""
import importlib.util
import os
import tempfile
import pytest
from shared.engines.render_lite import RenderLiteAnalyticsEngine, DuckDBAnalyticsEngine
from shared.engines.full_bda import HadoopMapReduceEngine, HiveServerAnalyticsEngine, SparkStreamingEngine

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
cleaner_path = os.path.join(BASE_DIR, "services", "preprocessing-service", "src", "cleaner.py")
spec = importlib.util.spec_from_file_location("cleaner", cleaner_path)
cleaner_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cleaner_mod)
preprocess_dataset = cleaner_mod.preprocess_dataset

SAMPLE_DATA_PATH = os.path.join(os.path.dirname(__file__), "../../data/household_power_consumption_sample.txt")


@pytest.fixture(scope="module")
def cleaned_sample_csv():
    """Generates a cleaned CSV from the sample data for engine tests."""
    assert os.path.exists(SAMPLE_DATA_PATH), f"Sample file not found at {SAMPLE_DATA_PATH}"
    temp_dir = tempfile.mkdtemp()
    clean_path = os.path.join(temp_dir, "cleaned_sample.csv")
    rejected_path = os.path.join(temp_dir, "rejected_sample.csv")
    report = preprocess_dataset(SAMPLE_DATA_PATH, clean_path, rejected_path)
    assert report.valid_rows > 0
    yield clean_path
    # Cleanup
    if os.path.exists(clean_path):
        os.remove(clean_path)
    if os.path.exists(rejected_path):
        os.remove(rejected_path)
    if os.path.exists(temp_dir):
        os.rmdir(temp_dir)


def test_render_lite_daily_aggregation(cleaned_sample_csv):
    with tempfile.TemporaryDirectory() as out_dir:
        out_txt = os.path.join(out_dir, "daily_out.txt")
        engine = RenderLiteAnalyticsEngine()
        success, msg = engine.run_job("DAILY", cleaned_sample_csv, out_txt)
        assert success is True
        assert os.path.exists(out_txt)
        with open(out_txt, "r") as f:
            lines = f.readlines()
        assert len(lines) > 0
        first_line = lines[0].strip().split("\t")
        assert len(first_line) == 2  # key \t value


def test_render_lite_hourly_aggregation(cleaned_sample_csv):
    with tempfile.TemporaryDirectory() as out_dir:
        out_txt = os.path.join(out_dir, "hourly_out.txt")
        engine = RenderLiteAnalyticsEngine()
        success, msg = engine.run_job("HOURLY", cleaned_sample_csv, out_txt)
        assert success is True
        assert os.path.exists(out_txt)
        with open(out_txt, "r") as f:
            lines = f.readlines()
        assert len(lines) > 0


def test_render_lite_monthly_aggregation(cleaned_sample_csv):
    with tempfile.TemporaryDirectory() as out_dir:
        out_txt = os.path.join(out_dir, "monthly_out.txt")
        engine = RenderLiteAnalyticsEngine()
        success, msg = engine.run_job("MONTHLY", cleaned_sample_csv, out_txt)
        assert success is True
        assert os.path.exists(out_txt)
        with open(out_txt, "r") as f:
            lines = f.readlines()
        assert len(lines) > 0


def test_render_lite_peak_aggregation(cleaned_sample_csv):
    with tempfile.TemporaryDirectory() as out_dir:
        out_txt = os.path.join(out_dir, "peak_out.txt")
        engine = RenderLiteAnalyticsEngine()
        success, msg = engine.run_job("PEAK", cleaned_sample_csv, out_txt, parameters={"threshold_kw": 2.0})
        assert success is True
        assert os.path.exists(out_txt)
        with open(out_txt, "r") as f:
            lines = f.readlines()
        assert len(lines) > 0


def test_duckdb_engine_query(cleaned_sample_csv):
    engine = DuckDBAnalyticsEngine()
    records, duration = engine.execute_query("daily_aggregates", cleaned_sample_csv, {"limit": 10})
    assert len(records) > 0
    assert "date" in records[0]
    assert "total_kwh" in records[0]
    assert "avg_power_kw" in records[0]
    assert duration >= 0.0


def test_full_bda_engines_fail_closed_when_cluster_down(cleaned_sample_csv):
    """
    Ensures that when BDA_MODE=FULL_BDA, if cluster endpoints are unreachable,
    the system fails closed rather than returning silent mock data.
    """
    mr_engine = HadoopMapReduceEngine(hadoop_home="/nonexistent/hadoop")
    success, msg = mr_engine.run_job("DAILY", cleaned_sample_csv, "/tmp/out")
    assert success is False
    assert "Hadoop binary not found" in msg or "failed" in msg

    hive_engine = HiveServerAnalyticsEngine(hive_host="invalid-hive-host", hive_port=10000)
    with pytest.raises(RuntimeError) as exc:
        hive_engine.execute_query("daily_aggregates", cleaned_sample_csv)
    assert "pyhive is required" in str(exc.value) or "HiveServer2" in str(exc.value)

    spark_engine = SparkStreamingEngine()
    spark_engine.start_stream("ds-test")
    status = spark_engine.get_status()
    assert status["mode"] == "FULL_BDA"
    assert status["is_running"] is True
    spark_engine.stop()
    assert spark_engine.get_status()["is_running"] is False
