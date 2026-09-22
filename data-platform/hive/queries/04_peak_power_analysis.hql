-- Query 04: Peak Power Analysis
-- Identifies top 50 highest instantaneous load events with appliance contribution.

USE bda_energy;

SELECT 
    `timestamp`,
    `date`,
    `hour`,
    global_active_power,
    voltage,
    global_intensity,
    sub_metering_1,
    sub_metering_2,
    sub_metering_3,
    (sub_metering_1 + sub_metering_2 + sub_metering_3) AS total_submeter_wh
FROM household_power_consumption
WHERE global_active_power >= 4.0
ORDER BY global_active_power DESC
LIMIT 50;
