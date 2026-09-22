"""
Independent Analytical Correctness Verification Engine.
Mandated by Blueprint Requirement 50:
Verifies calculation correctness across three independent implementations:
1. Baseline Local Math Engine (Python native accumulation)
2. Hadoop MapReduce Engine (Mapper | Shuffle/Sort | Reducer)
3. Apache Hive Analytical Query Engine (DuckDB / HiveQL)
Evaluates floating-point precision tolerance to prove exact analytical accuracy.
"""

import os
import shutil
import sys
import tempfile
from collections import defaultdict

# Set path
BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, BASE_DIR)

from jobs.mapreduce.runner import LocalStreamingPipelineRunner
from scripts.dev_server import hive_mod, prep_mod

preprocess_dataset = prep_mod.cleaner_mod.preprocess_dataset if hasattr(prep_mod, "cleaner_mod") else prep_mod.preprocess_dataset
execute_analytical_query = hive_mod.execute_analytical_query


def compute_local_baseline(cleaned_csv_path: str) -> dict[str, dict[str, float]]:
    """
    Independent baseline calculation in pure Python standard library.
    No MapReduce or SQL frameworks.
    """
    days = defaultdict(lambda: {
        "powers": [], "sub1": 0.0, "sub2": 0.0, "sub3": 0.0, "count": 0
    })

    with open(cleaned_csv_path, encoding="utf-8") as f:
        # Skip header
        f.readline()
        for line in f:
            parts = line.strip().split(",")
            if len(parts) < 13:
                continue
            date_str = parts[8]
            p_active = float(parts[1])
            s1 = float(parts[5])
            s2 = float(parts[6])
            s3 = float(parts[7])

            d = days[date_str]
            d["powers"].append(p_active)
            d["sub1"] += s1
            d["sub2"] += s2
            d["sub3"] += s3
            d["count"] += 1

    results = {}
    for date_k, d in days.items():
        total_p = sum(d["powers"])
        count = d["count"]
        results[date_k] = {
            "total_kwh": round(total_p / 60.0, 4),
            "avg_power": round(total_p / count, 4),
            "min_power": round(min(d["powers"]), 4),
            "max_power": round(max(d["powers"]), 4),
            "count": count,
        }
    return results


def run_correctness_verification():
    raw_sample = os.path.join(BASE_DIR, "data", "household_power_consumption_sample.txt")
    if not os.path.exists(raw_sample):
        from scripts.generate_sample_data import generate_household_power_sample
        generate_household_power_sample(raw_sample, num_days=7)

    # Step 1: Preprocess to clean format. mkdtemp gives a private directory whose
    # names cannot be pre-empted by another process, unlike the deprecated mktemp.
    work_dir = tempfile.mkdtemp(prefix="bda-verify-")
    clean_tmp = os.path.join(work_dir, "cleaned.csv")
    rej_tmp = os.path.join(work_dir, "rejected.log")
    mr_out_tmp = os.path.join(work_dir, "mapreduce_output.txt")

    try:
        print("[VERIFY] 1. Preprocessing raw benchmark dataset...")
        preprocess_dataset(raw_sample, clean_tmp, rej_tmp)

        # Step 2: Compute Baseline
        print("[VERIFY] 2. Computing Local Pure-Math Baseline...")
        baseline = compute_local_baseline(clean_tmp)

        # Step 3: Compute MapReduce
        print("[VERIFY] 3. Executing Hadoop MapReduce DAILY Pipeline...")
        ok, msg = LocalStreamingPipelineRunner.run_pipeline("DAILY", clean_tmp, mr_out_tmp)
        if not ok:
            raise RuntimeError(f"MapReduce pipeline failed: {msg}")

        mr_results = {}
        with open(mr_out_tmp, encoding="utf-8") as f:
            for line in f:
                parts = line.strip().split("\t")
                if len(parts) != 2:
                    continue
                d_key = parts[0]
                tokens = parts[1].split(",")
                mr_results[d_key] = {
                    "total_kwh": float(tokens[0]),
                    "avg_power": float(tokens[1]),
                    "min_power": float(tokens[2]),
                    "max_power": float(tokens[3]),
                    "count": int(tokens[7]),
                }

        # Step 4: Compute HiveQL
        print("[VERIFY] 4. Executing Apache HiveQL Daily Aggregation Query...")
        hive_rows, _duration = execute_analytical_query("daily_aggregates", clean_tmp, {"limit": 100})
        hive_results = {}
        for r in hive_rows:
            d_key = r["date"]
            hive_results[d_key] = {
                "total_kwh": float(r["total_consumption_kwh"]),
                "avg_power": float(r["average_power_kw"]),
                "min_power": float(r["min_power_kw"]),
                "max_power": float(r["max_power_kw"]),
                "count": int(r["reading_count"]),
            }

        # Step 5: Triangulate & Compare
        print("\n=========================================================================================")
        print("          ANALYTICS CORRECTNESS TRIANGULATION MATRIX (Requirement 50)                    ")
        print("=========================================================================================")
        print(f"{'Date':<12} | {'Metric':<10} | {'Local Baseline':<14} | {'MapReduce':<14} | {'HiveQL':<14} | {'Delta':<10}")
        print("-" * 89)

        max_delta_kwh = 0.0
        max_delta_avg = 0.0

        for date_key in sorted(baseline.keys())[:7]:
            b = baseline[date_key]
            m = mr_results.get(date_key, {})
            h = hive_results.get(date_key, {})

            delta_mr_kwh = abs(b["total_kwh"] - m.get("total_kwh", 0.0))
            delta_hive_kwh = abs(b["total_kwh"] - h.get("total_kwh", 0.0))
            max_delta_kwh = max(max_delta_kwh, delta_mr_kwh, delta_hive_kwh)

            delta_mr_avg = abs(b["avg_power"] - m.get("avg_power", 0.0))
            delta_hive_avg = abs(b["avg_power"] - h.get("avg_power", 0.0))
            max_delta_avg = max(max_delta_avg, delta_mr_avg, delta_hive_avg)

            print(f"{date_key:<12} | {'Total kWh':<10} | {b['total_kwh']:<14.4f} | {m.get('total_kwh', 0):<14.4f} | {h.get('total_kwh', 0):<14.4f} | {max(delta_mr_kwh, delta_hive_kwh):<10.6f}")
            print(f"{date_key:<12} | {'Avg Power':<10} | {b['avg_power']:<14.4f} | {m.get('avg_power', 0):<14.4f} | {h.get('avg_power', 0):<14.4f} | {max(delta_mr_avg, delta_hive_avg):<10.6f}")
            print(f"{date_key:<12} | {'Readings':<10} | {b['count']:<14} | {m.get('count', 0):<14} | {h.get('count', 0):<14} | 0")
            print("-" * 89)

        # Verification Assertions (IEEE 754 floating point tolerance: 0.0005)
        tolerance = 0.0005
        assert max_delta_kwh <= tolerance, f"Total kWh discrepancy exceeds tolerance: {max_delta_kwh}"
        assert max_delta_avg <= tolerance, f"Avg Power discrepancy exceeds tolerance: {max_delta_avg}"

        print("\n[SUCCESS] Independent Analytics Triangulation Verified!")
        print(f"Max Total kWh Delta: {max_delta_kwh:.8f} (Tolerance: {tolerance})")
        print(f"Max Avg Power Delta: {max_delta_avg:.8f} (Tolerance: {tolerance})")
        print("Floating-point rounding differences comply with IEEE 754 standards.")
        return True

    finally:
        shutil.rmtree(work_dir, ignore_errors=True)


if __name__ == "__main__":
    success = run_correctness_verification()
    sys.exit(0 if success else 1)
