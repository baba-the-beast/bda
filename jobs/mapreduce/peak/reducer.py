#!/usr/bin/env python3
"""
MapReduce Job 4: Peak Consumption - Reducer
Input: Sorted stream of period_key \t ts,active_power,voltage,intensity,sub1,sub2,sub3
Output:
period_key \t peak_timestamp,max_power,avg_power_in_period,voltage,intensity,sub1,sub2,sub3,peak_count
"""

import sys


def run_reducer():
    current_period = None
    peak_record = None
    max_power = float("-inf")
    sum_power = 0.0
    count = 0

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        parts = line.split("\t")
        if len(parts) != 2:
            continue

        period_key, val_str = parts[0], parts[1]
        tokens = val_str.split(",")
        if len(tokens) != 7:
            continue

        try:
            ts = tokens[0]
            power = float(tokens[1])
            voltage = float(tokens[2])
            intensity = float(tokens[3])
            s1 = float(tokens[4])
            s2 = float(tokens[5])
            s3 = float(tokens[6])
        except ValueError:
            continue

        if current_period == period_key:
            sum_power += power
            count += 1
            if power > max_power:
                max_power = power
                peak_record = (ts, power, voltage, intensity, s1, s2, s3)
        else:
            if current_period is not None and peak_record is not None:
                avg_p = sum_power / count
                ts, p, v, intens, s1, s2, s3 = peak_record
                sys.stdout.write(f"{current_period}\t{ts},{p:.3f},{avg_p:.3f},{v:.1f},{intens:.1f},{s1:.0f},{s2:.0f},{s3:.0f},{count}\n")

            current_period = period_key
            max_power = power
            sum_power = power
            count = 1
            peak_record = (ts, power, voltage, intensity, s1, s2, s3)

    if current_period is not None and peak_record is not None:
        avg_p = sum_power / count
        ts, p, v, intens, s1, s2, s3 = peak_record
        sys.stdout.write(f"{current_period}\t{ts},{p:.3f},{avg_p:.3f},{v:.1f},{intens:.1f},{s1:.0f},{s2:.0f},{s3:.0f},{count}\n")


if __name__ == "__main__":
    run_reducer()
