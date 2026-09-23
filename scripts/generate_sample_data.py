"""
High-fidelity UCI Individual Household Electric Power Consumption dataset generator.
Generates realistic multi-day time series mimicking the exact format and distributions of the official dataset.
Used for deterministic testing, unit test suites, integration tests, and local benchmarking.
"""

import os
import random
from datetime import UTC, datetime, timedelta

DATA_DIR = os.getenv("DATA_DIR", os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data")))
SAMPLE_FILE = os.path.join(DATA_DIR, "household_power_consumption_sample.txt")


def generate_household_power_sample(
    output_path: str = SAMPLE_FILE,
    num_days: int = 14,
    start_date: datetime = datetime(2006, 12, 16, 17, 24, 0, tzinfo=UTC),
    missing_rate: float = 0.012,  # ~1.2% missing '?' records, similar to real UCI dataset
    seed: int = 42,
) -> str:
    random.seed(seed)
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    header = "Date;Time;Global_active_power;Global_reactive_power;Voltage;Global_intensity;Sub_metering_1;Sub_metering_2;Sub_metering_3\n"
    total_minutes = num_days * 24 * 60
    current_time = start_date

    print(f"[INFO] Generating {total_minutes} minute-level records ({num_days} days) to {output_path}...")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write(header)
        for _ in range(total_minutes):
            date_str = current_time.strftime("%d/%m/%Y")
            time_str = current_time.strftime("%H:%M:%S")

            # Check if this row is a missing value '?'
            if random.random() < missing_rate:
                row = f"{date_str};{time_str};?;?;?;?;?;?;?\n"
            else:
                hour = current_time.hour
                # Base diurnal load profile
                # Peak hours: morning (7-9) and evening (18-22)
                if 18 <= hour <= 22:
                    base_power = random.uniform(2.5, 6.8)
                elif 7 <= hour <= 9:
                    base_power = random.uniform(1.8, 4.2)
                elif 0 <= hour <= 5:
                    base_power = random.uniform(0.2, 0.7)
                else:
                    base_power = random.uniform(0.8, 2.2)

                # Occasionally inject spike loads (kettle, oven, aircon)
                if random.random() < 0.05:
                    base_power += random.uniform(2.0, 4.5)

                active_power = round(base_power, 3)
                reactive_power = round(random.uniform(0.05, 0.35) * (1.0 + active_power * 0.1), 3)
                voltage = round(random.gauss(240.8, 3.2), 2)
                intensity = round((active_power * 1000.0) / (voltage * 0.95), 1)

                # Sub-metering logic
                # Sub 1: Kitchen (dishwasher, oven, microwave) -> mostly evening / lunch
                sub1 = 0.0
                if (12 <= hour <= 13 or 19 <= hour <= 21) and random.random() < 0.35:
                    sub1 = round(random.uniform(1.0, 38.0), 0)

                # Sub 2: Laundry (washer, dryer, fridge, light)
                sub2 = 0.0
                if (9 <= hour <= 15) and random.random() < 0.25:
                    sub2 = round(random.uniform(1.0, 36.0), 0)
                elif random.random() < 0.08:
                    sub2 = round(random.uniform(1.0, 2.0), 0)  # fridge cycle

                # Sub 3: Water heater + Aircon (climate)
                sub3 = 0.0
                if active_power > 1.2:
                    sub3 = round(random.uniform(10.0, 29.0), 0)
                elif active_power > 0.4:
                    sub3 = round(random.uniform(1.0, 18.0), 0)

                row = f"{date_str};{time_str};{active_power};{reactive_power};{voltage};{intensity};{sub1};{sub2};{sub3}\n"

            f.write(row)
            current_time += timedelta(minutes=1)

    print(f"[INFO] Generated successfully. File size: {os.path.getsize(output_path) / (1024*1024):.2f} MB")
    return output_path


if __name__ == "__main__":
    generate_household_power_sample()
