-- Query 06: Voltage Stability & Grid Intensity Correlation
-- Evaluates distribution of voltage levels, grid stress, and power factor indicators.

USE bda_energy;

SELECT 
    CASE 
        WHEN voltage < 235.0 THEN 'Low Voltage (<235V)'
        WHEN voltage BETWEEN 235.0 AND 245.0 THEN 'Nominal (235V-245V)'
        ELSE 'High Voltage (>245V)'
    END AS voltage_band,
    ROUND(AVG(voltage), 2) AS avg_voltage,
    ROUND(AVG(global_intensity), 2) AS avg_intensity,
    ROUND(AVG(global_active_power), 3) AS avg_active_power,
    ROUND(AVG(global_reactive_power), 3) AS avg_reactive_power,
    COUNT(*) AS reading_count
FROM household_power_consumption
WHERE voltage IS NOT NULL AND global_active_power IS NOT NULL
GROUP BY 
    CASE 
        WHEN voltage < 235.0 THEN 'Low Voltage (<235V)'
        WHEN voltage BETWEEN 235.0 AND 245.0 THEN 'Nominal (235V-245V)'
        ELSE 'High Voltage (>245V)'
    END
ORDER BY avg_voltage ASC;
