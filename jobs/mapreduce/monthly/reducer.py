#!/usr/bin/env python3
"""
MapReduce Job 3: Monthly Energy Consumption - Reducer
Input: Sorted stream of YYYY-MM \t active_power,1
Output: YYYY-MM \t total_kwh,avg_power,min_power,max_power,reading_count
"""

import sys


def run_reducer():
    current_month = None
    sum_active = 0.0
    min_active = float("inf")
    max_active = float("-inf")
    count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) != 2:
            continue

        month_key, val_str = parts[0], parts[1]
        try:
            val_parts = val_str.split(",")
            active_power = float(val_parts[0])
            c = int(val_parts[1])
        except (ValueError, IndexError):
            continue

        if current_month == month_key:
            sum_active += active_power
            if active_power < min_active:
                min_active = active_power
            if active_power > max_active:
                max_active = active_power
            count += c
        else:
            if current_month is not None and count > 0:
                avg_active = sum_active / count
                total_kwh = sum_active / 60.0
                sys.stdout.write(f"{current_month}\t{total_kwh:.4f},{avg_active:.4f},{min_active:.4f},{max_active:.4f},{count}\n")

            current_month = month_key
            sum_active = active_power
            min_active = active_power
            max_active = active_power
            count = c

    if current_month is not None and count > 0:
        avg_active = sum_active / count
        total_kwh = sum_active / 60.0
        sys.stdout.write(f"{current_month}\t{total_kwh:.4f},{avg_active:.4f},{min_active:.4f},{max_active:.4f},{count}\n")


if __name__ == "__main__":
    run_reducer()
