"""
Energy Data Cleaning and Quality Validation Subsystem.
Transforms raw UCI household electric power consumption records into validated,
structured time series adhering to the target analytical schema.
"""

from datetime import datetime, timezone
import hashlib
import os
import time
from typing import Dict, Tuple

from shared.logger import get_logger
from shared.models import DataQualityReport

logger = get_logger("preprocessing-cleaner")

CLEAN_HEADER = (
    "timestamp,global_active_power,global_reactive_power,voltage,global_intensity,"
    "sub_metering_1,sub_metering_2,sub_metering_3,date,hour,day,month,year\n"
)


def preprocess_dataset(
    input_file_path: str,
    output_clean_path: str,
    output_rejected_path: str,
) -> DataQualityReport:
    start_time = time.time()
    total_input = 0
    valid_count = 0
    invalid_count = 0
    missing_count = 0
    extreme_candidate_count = 0
    rejection_reasons: Dict[str, int] = {
        "MISSING_VALUE_QUESTION_MARK": 0,
        "INVALID_COLUMN_COUNT": 0,
        "INVALID_TIMESTAMP_FORMAT": 0,
        "NUMERIC_CONVERSION_ERROR": 0,
        "PHYSICALLY_IMPOSSIBLE_VALUE": 0,
    }

    os.makedirs(os.path.dirname(output_clean_path), exist_ok=True)
    os.makedirs(os.path.dirname(output_rejected_path), exist_ok=True)

    hasher = hashlib.sha256()

    with open(input_file_path, "r", encoding="utf-8", errors="ignore") as in_f, \
         open(output_clean_path, "w", encoding="utf-8") as out_clean, \
         open(output_rejected_path, "w", encoding="utf-8") as out_rejected:

        # Write clean header
        out_clean.write(CLEAN_HEADER)
        out_rejected.write("raw_line;rejection_reason;line_number\n")

        for line_idx, line in enumerate(in_f, start=1):
            line_str = line.strip()
            if not line_str:
                continue

            # Skip header row if present
            if line_str.startswith("Date") or line_str.startswith("date"):
                continue

            total_input += 1

            # Detect delimiter
            delimiter = ";" if ";" in line_str else ","
            parts = [p.strip() for p in line_str.split(delimiter)]

            if len(parts) < 9:
                invalid_count += 1
                rejection_reasons["INVALID_COLUMN_COUNT"] += 1
                out_rejected.write(f"{line_str};INVALID_COLUMN_COUNT;{line_idx}\n")
                continue

            # Check for missing '?' representation
            if any(p == "?" for p in parts):
                missing_count += 1
                invalid_count += 1
                rejection_reasons["MISSING_VALUE_QUESTION_MARK"] += 1
                out_rejected.write(f"{line_str};MISSING_VALUE_QUESTION_MARK;{line_idx}\n")
                continue

            # Parse Date & Time
            d_str, t_str = parts[0], parts[1]
            # UCI format: dd/mm/yyyy hh:mm:ss
            dt_obj = None
            for fmt in ("%d/%m/%Y %H:%M:%S", "%Y-%m-%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
                try:
                    dt_obj = datetime.strptime(f"{d_str} {t_str}", fmt)
                    break
                except ValueError:
                    pass

            if dt_obj is None:
                invalid_count += 1
                rejection_reasons["INVALID_TIMESTAMP_FORMAT"] += 1
                out_rejected.write(f"{line_str};INVALID_TIMESTAMP_FORMAT;{line_idx}\n")
                continue

            # Parse numeric attributes
            try:
                gap = float(parts[2])
                grp = float(parts[3])
                volt = float(parts[4])
                gi = float(parts[5])
                sub1 = float(parts[6])
                sub2 = float(parts[7])
                sub3 = float(parts[8])
            except ValueError:
                invalid_count += 1
                rejection_reasons["NUMERIC_CONVERSION_ERROR"] += 1
                out_rejected.write(f"{line_str};NUMERIC_CONVERSION_ERROR;{line_idx}\n")
                continue

            # Sanity range checks (physics bounds)
            if gap < 0 or grp < 0 or volt < 0 or gi < 0 or sub1 < 0 or sub2 < 0 or sub3 < 0:
                invalid_count += 1
                rejection_reasons["PHYSICALLY_IMPOSSIBLE_VALUE"] += 1
                out_rejected.write(f"{line_str};PHYSICALLY_IMPOSSIBLE_VALUE;{line_idx}\n")
                continue

            # Flag valid but unusual reading (extreme load spike, e.g. > 8.0 kW)
            if gap > 8.0:
                extreme_candidate_count += 1

            # Format Clean Record
            iso_ts = dt_obj.strftime("%Y-%m-%dT%H:%M:%SZ")
            date_key = dt_obj.strftime("%Y-%m-%d")
            hour_val = dt_obj.hour
            day_val = dt_obj.day
            month_val = dt_obj.month
            year_val = dt_obj.year

            clean_row = (
                f"{iso_ts},{gap:.3f},{grp:.3f},{volt:.2f},{gi:.1f},"
                f"{sub1:.1f},{sub2:.1f},{sub3:.1f},"
                f"{date_key},{hour_val},{day_val},{month_val},{year_val}\n"
            )

            out_clean.write(clean_row)
            hasher.update(clean_row.encode("utf-8"))
            valid_count += 1

    duration = time.time() - start_time
    checksum = hasher.hexdigest()

    report = DataQualityReport(
        total_input_rows=total_input,
        valid_rows=valid_count,
        invalid_rows=invalid_count,
        missing_value_rows=missing_count,
        rejected_rows=invalid_count,
        processing_duration_sec=round(duration, 3),
        extreme_candidate_count=extreme_candidate_count,
        checksum_sha256=checksum,
        schema_version="1.0.0",
        rejection_reasons=rejection_reasons,
    )

    logger.info(
        f"Preprocessing finished in {duration:.2f}s: {valid_count} valid, {invalid_count} rejected "
        f"({missing_count} missing '?'). Checksum: {checksum[:12]}..."
    )
    return report
