-- Query 03: Monthly Trends & Seasonality
-- Groups by year and month to evaluate seasonal heating/cooling shifts.

USE bda_energy;

SELECT 
    `year`,
    `month`,
    ROUND(SUM(global_active_power) / 60.0, 4) AS total_monthly_kwh,
    ROUND(AVG(global_active_power), 4) AS average_power_kw,
    ROUND(MIN(global_active_power), 4) AS min_power_kw,
    ROUND(MAX(global_active_power), 4) AS max_power_kw,
    COUNT(*) AS reading_count
FROM household_power_consumption
WHERE global_active_power IS NOT NULL
GROUP BY `year`, `month`
ORDER BY `year` ASC, `month` ASC;
