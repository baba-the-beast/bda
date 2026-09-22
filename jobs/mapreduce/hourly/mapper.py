#!/usr/bin/env python3
"""
MapReduce Job 2: Hourly Energy Consumption - Mapper
Emits hour-of-day (00-23) or date-hour as key.
Default key: hour (00-23) for diurnal hourly load profiles.
Output:
Key: hour (00-23)
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
                hour = int(parts[9])  # hour field (0-23)
                active_power = float(parts[1])
                sys.stdout.write(f"{hour:02d}\t{active_power},1\n")
            except (ValueError, IndexError):
                continue
        else:
            # Fallback raw line
            parts = line.split(";")
            if len(parts) >= 9:
                try:
                    time_parts = parts[1].strip().split(":")
                    hour = int(time_parts[0])
                    active_power = float(parts[2])
                    sys.stdout.write(f"{hour:02d}\t{active_power},1\n")
                except (ValueError, IndexError):
                    continue


if __name__ == "__main__":
    run_mapper()
