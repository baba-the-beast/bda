#!/usr/bin/env python3
"""
MapReduce Job 4: Peak Consumption - Mapper
Identifies peak power events exceeding a configurable threshold.
Environment Variable: PEAK_THRESHOLD_KW (default: 4.0 kW)
Output:
Key: date-hour or 'ALL_PEAKS'
Value: timestamp,active_power,voltage,intensity,sub1,sub2,sub3
"""

import os
import sys

THRESHOLD_KW = float(os.getenv("PEAK_THRESHOLD_KW", "4.0"))


def run_mapper():
    for line in sys.stdin:
        line = line.strip()
        if not line or line.startswith("timestamp") or line.startswith("Date"):
            continue

        parts = line.split(",")
        if len(parts) >= 13:
            try:
                ts = parts[0].strip()
                active_power = float(parts[1])
                if active_power >= THRESHOLD_KW:
                    voltage = float(parts[3])
                    intensity = float(parts[4])
                    sub1 = float(parts[5])
                    sub2 = float(parts[6])
                    sub3 = float(parts[7])
                    date_val = parts[8].strip()
                    hour_val = parts[9].strip()
                    period_key = f"{date_val}_{hour_val}"
                    # Emit with period key
                    sys.stdout.write(f"{period_key}\t{ts},{active_power},{voltage},{intensity},{sub1},{sub2},{sub3}\n")
            except (ValueError, IndexError):
                continue
        else:
            parts = line.split(";")
            if len(parts) >= 9:
                try:
                    active_power = float(parts[2])
                    if active_power >= THRESHOLD_KW:
                        ts = f"{parts[0]} {parts[1]}"
                        voltage = float(parts[4])
                        intensity = float(parts[5])
                        sub1 = float(parts[6])
                        sub2 = float(parts[7])
                        sub3 = float(parts[8])
                        period_key = parts[0].strip()
                        sys.stdout.write(f"{period_key}\t{ts},{active_power},{voltage},{intensity},{sub1},{sub2},{sub3}\n")
                except (ValueError, IndexError):
                    continue


if __name__ == "__main__":
    run_mapper()
