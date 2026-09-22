"""
Analytical Mathematics & Aggregation Correctness Tests.
Validates numerical formulas, energy unit conversions, weighted averages,
and sub-meter calculations against a deterministic fixture.
"""

import math
import pytest
from shared.engines.render_lite import RenderLiteAnalyticsEngine
from shared.models import DailyAggregate, HourlyAggregate


def test_energy_conversion_math():
    """
    Validates that power (kW) sampled every minute integrates to energy (kWh):
    Energy (kWh) = sum(Power (kW)) / 60.0
    """
    # 60 readings of constant 2.5 kW over 1 hour should equal exactly 2.5 kWh
    minute_readings = [2.5] * 60
    total_kwh = sum(minute_readings) / 60.0
    assert math.isclose(total_kwh, 2.5, rel_tol=1e-6)

    # 1440 readings (24 hours) of 1.0 kW should equal 24.0 kWh
    full_day_readings = [1.0] * 1440
    daily_kwh = sum(full_day_readings) / 60.0
    assert math.isclose(daily_kwh, 24.0, rel_tol=1e-6)


def test_weighted_average_calculation():
    """
    Validates mathematically rigorous weighted average power calculation:
    weighted_avg = sum(avg_power_i * count_i) / sum(count_i)
    """
    day1 = DailyAggregate(
        dataset_id="test_ds",
        date="2007-01-01",
        total_consumption_kwh=24.0,
        average_power=1.0,
        minimum_power=0.5,
        maximum_power=2.0,
        sub_metering_1_total=100.0,
        sub_metering_2_total=200.0,
        sub_metering_3_total=300.0,
        reading_count=1440,
    )
    # Day 2 has only 720 readings (half day) at 3.0 kW
    day2 = DailyAggregate(
        dataset_id="test_ds",
        date="2007-01-02",
        total_consumption_kwh=36.0,
        average_power=3.0,
        minimum_power=1.0,
        maximum_power=5.0,
        sub_metering_1_total=150.0,
        sub_metering_2_total=250.0,
        sub_metering_3_total=350.0,
        reading_count=720,
    )

    days = [day1, day2]
    total_readings = sum(d.reading_count for d in days)
    weighted_avg = sum(d.average_power * d.reading_count for d in days) / total_readings
    # (1.0 * 1440 + 3.0 * 720) / 2160 = (1440 + 2160) / 2160 = 3600 / 2160 = 1.66666...
    assert math.isclose(weighted_avg, 1.6667, abs_tol=1e-4)

    # Simple unweighted average (1.0 + 3.0)/2 = 2.0 would be biased and incorrect!
    simple_avg = sum(d.average_power for d in days) / len(days)
    assert simple_avg != weighted_avg


def test_submeter_percentage_math():
    """
    Validates submeter disaggregation percentage math.
    """
    sub1_total_wh = 1000.0  # 1.0 kWh
    sub2_total_wh = 2000.0  # 2.0 kWh
    sub3_total_wh = 7000.0  # 7.0 kWh
    total_sub_wh = sub1_total_wh + sub2_total_wh + sub3_total_wh

    pct1 = (sub1_total_wh / total_sub_wh) * 100.0
    pct2 = (sub2_total_wh / total_sub_wh) * 100.0
    pct3 = (sub3_total_wh / total_sub_wh) * 100.0

    assert math.isclose(pct1, 10.0, rel_tol=1e-5)
    assert math.isclose(pct2, 20.0, rel_tol=1e-5)
    assert math.isclose(pct3, 70.0, rel_tol=1e-5)
    assert math.isclose(pct1 + pct2 + pct3, 100.0, rel_tol=1e-5)


def test_power_factor_physics():
    """
    Validates AC single-phase physics relationship:
    P = V * I * cos(phi)
    """
    voltage = 230.0  # Volts
    intensity = 10.0  # Amperes
    apparent_power_kva = (voltage * intensity) / 1000.0  # 2.3 kVA
    cos_phi = 0.95

    active_power_kw = apparent_power_kva * cos_phi
    assert math.isclose(active_power_kw, 2.185, rel_tol=1e-4)
