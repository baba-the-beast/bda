#!/usr/bin/env python3
"""
MapReduce Job 3: Monthly Energy Consumption - Mapper
Emits YYYY-MM as key.
Output:
Key: YYYY-MM
Value: active_power,1
"""

import sys


def run_mapper():
    for line in sys.stdin:
        line = line.strip()
        if not line or line.startswith("timestamp") or line.startswith("Date"):
            continue

        parts = line.split(",")
        if len(parts) >= 13:
            try:
                year = parts[12].strip()
                month = str(int(parts[11])).zfill(2)
                key = f"{year}-{month}"
                active_power = float(parts[1])
                sys.stdout.write(f"{key}\t{active_power},1\n")
            except (ValueError, IndexError):
                continue
        else:
            parts = line.split(";")
            if len(parts) >= 9:
                try:
                    date_parts = parts[0].strip().split("/")
                    # dd/mm/yyyy
                    if len(date_parts) == 3:
                        key = f"{date_parts[2]}-{date_parts[1].zfill(2)}"
                        active_power = float(parts[2])
                        sys.stdout.write(f"{key}\t{active_power},1\n")
                except (ValueError, IndexError):
                    continue


if __name__ == "__main__":
    run_mapper()
