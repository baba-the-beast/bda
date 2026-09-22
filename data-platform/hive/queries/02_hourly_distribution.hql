-- Query 02: Hourly Consumption & Diurnal Profile
-- Groups by hour of day (0-23) to determine peak household activity periods.

USE bda_energy;

SELECT 
    `hour`,
    ROUND(SUM(global_active_power) / 60.0, 4) AS total_consumption_kwh,
    ROUND(AVG(global_active_power), 4) AS average_power_kw,
    ROUND(MIN(global_active_power), 4) AS min_power_kw,
    ROUND(MAX(global_active_power), 4) AS max_power_kw,
    ROUND(AVG(voltage), 2) AS avg_voltage_v,
    ROUND(AVG(global_intensity), 2) AS avg_intensity_a,
    COUNT(*) AS reading_count
FROM household_power_consumption
WHERE global_active_power IS NOT NULL
GROUP BY `hour`
ORDER BY `hour` ASC;
