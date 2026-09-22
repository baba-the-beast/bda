-- Query 01: Daily Power Aggregates
-- Computes daily total energy (kWh), average power, min/max bounds, and reading count.

USE bda_energy;

SELECT 
    `date`,
    ROUND(SUM(global_active_power) / 60.0, 4) AS total_consumption_kwh,
    ROUND(AVG(global_active_power), 4) AS average_power_kw,
    ROUND(MIN(global_active_power), 4) AS min_power_kw,
    ROUND(MAX(global_active_power), 4) AS max_power_kw,
    ROUND(SUM(sub_metering_1), 2) AS sub1_kitchen_total_wh,
    ROUND(SUM(sub_metering_2), 2) AS sub2_laundry_total_wh,
    ROUND(SUM(sub_metering_3), 2) AS sub3_climate_total_wh,
    COUNT(*) AS reading_count
FROM household_power_consumption
WHERE global_active_power IS NOT NULL
GROUP BY `date`
ORDER BY `date` ASC;
