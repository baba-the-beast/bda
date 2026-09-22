#!/usr/bin/env python3
"""
MapReduce Job 1: Daily Energy Consumption - Mapper
Input: Cleaned CSV record:
timestamp,global_active_power,global_reactive_power,voltage,global_intensity,sub_metering_1,sub_metering_2,sub_metering_3,date,hour,day,month,year
Output:
Key: date (YYYY-MM-DD)
Value: global_active_power,global_reactive_power,sub_1,sub_2,sub_3,1
"""

import sys


def run_mapper():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        # Skip header if present
        if line.startswith("timestamp") or line.startswith("Date"):
            continue

        parts = line.split(",")
        if len(parts) < 13:
            # Fallback if semicolon separated raw data is piped
            parts = line.split(";")
            if len(parts) >= 9:
                # Raw UCI row: Date;Time;GAP;GRP;V;GI;Sub1;Sub2;Sub3
                d_raw = parts[0].strip()
                t_raw = parts[1].strip()
                try:
                    p_active = float(parts[2])
                    p_react = float(parts[3])
                    s1 = float(parts[6])
                    s2 = float(parts[7])
                    s3 = float(parts[8])
                    # Parse dd/mm/yyyy -> yyyy-mm-dd
                    d_tokens = d_raw.split("/")
                    if len(d_tokens) == 3:
                        d_norm = f"{d_tokens[2]}-{d_tokens[1].zfill(2)}-{d_tokens[0].zfill(2)}"
                    else:
                        d_norm = d_raw
                    sys.stdout.write(f"{d_norm}\t{p_active},{p_react},{s1},{s2},{s3},1\n")
                except ValueError:
                    continue
            continue

        try:
            date_key = parts[8].strip()  # date YYYY-MM-DD
            active_power = float(parts[1])
            reactive_power = float(parts[2])
            sub1 = float(parts[5])
            sub2 = float(parts[6])
            sub3 = float(parts[7])
            # Key \t Value
            sys.stdout.write(f"{date_key}\t{active_power},{reactive_power},{sub1},{sub2},{sub3},1\n")
        except (ValueError, IndexError):
            continue


if __name__ == "__main__":
    run_mapper()
