-- Query 05: Sub-Meter Comparison
-- Computes aggregate energy and percentage breakdown for Kitchen, Laundry, and Climate.

USE bda_energy;

SELECT 
    ROUND(SUM(sub_metering_1) / 1000.0, 2) AS kitchen_total_kwh,
    ROUND(SUM(sub_metering_2) / 1000.0, 2) AS laundry_total_kwh,
    ROUND(SUM(sub_metering_3) / 1000.0, 2) AS climate_total_kwh,
    ROUND(
        (SUM(sub_metering_1) * 100.0) / 
        NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 
        2
    ) AS kitchen_percentage,
    ROUND(
        (SUM(sub_metering_2) * 100.0) / 
        NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 
        2
    ) AS laundry_percentage,
    ROUND(
        (SUM(sub_metering_3) * 100.0) / 
        NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 
        2
    ) AS climate_percentage,
    COUNT(*) AS total_records
FROM household_power_consumption
WHERE global_active_power IS NOT NULL;
