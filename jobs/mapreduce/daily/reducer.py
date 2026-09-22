#!/usr/bin/env python3
"""
MapReduce Job 1: Daily Energy Consumption - Reducer
Input: Sorted stream of:
date \t active_power,reactive_power,sub1,sub2,sub3,count
Output:
date \t total_consumption_kwh,avg_power,min_power,max_power,sub1_total,sub2_total,sub3_total,reading_count
"""

import sys


def run_reducer():
    current_date = None
    sum_active = 0.0
    min_active = float("inf")
    max_active = float("-inf")
    sum_sub1 = 0.0
    sum_sub2 = 0.0
    sum_sub3 = 0.0
    count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) != 2:
            continue

        date_key, val_str = parts[0], parts[1]
        val_parts = val_str.split(",")
        if len(val_parts) != 6:
            continue

        try:
            active_power = float(val_parts[0])
            _reactive_power = float(val_parts[1])
            s1 = float(val_parts[2])
            s2 = float(val_parts[3])
            s3 = float(val_parts[4])
            c = int(val_parts[5])
        except ValueError:
            continue

        if current_date == date_key:
            sum_active += active_power
            if active_power < min_active:
                min_active = active_power
            if active_power > max_active:
                max_active = active_power
            sum_sub1 += s1
            sum_sub2 += s2
            sum_sub3 += s3
            count += c
        else:
            if current_date is not None and count > 0:
                avg_active = sum_active / count
                # 1 minute measurement of kW -> kWh = kW / 60
                total_kwh = sum_active / 60.0
                sys.stdout.write(
                    f"{current_date}\t{total_kwh:.4f},{avg_active:.4f},{min_active:.4f},{max_active:.4f},"
                    f"{sum_sub1:.2f},{sum_sub2:.2f},{sum_sub3:.2f},{count}\n"
                )

            current_date = date_key
            sum_active = active_power
            min_active = active_power
            max_active = active_power
            sum_sub1 = s1
            sum_sub2 = s2
            sum_sub3 = s3
            count = c

    if current_date is not None and count > 0:
        avg_active = sum_active / count
        total_kwh = sum_active / 60.0
        sys.stdout.write(
            f"{current_date}\t{total_kwh:.4f},{avg_active:.4f},{min_active:.4f},{max_active:.4f},"
            f"{sum_sub1:.2f},{sum_sub2:.2f},{sum_sub3:.2f},{count}\n"
        )


if __name__ == "__main__":
    run_reducer()
