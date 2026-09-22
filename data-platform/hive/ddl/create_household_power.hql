-- =============================================================================
-- Apache Hive DDL: External Table for Household Power Consumption
-- Underlying data format: Cleaned CSV records stored on HDFS
-- Location: /user/bda/energy/cleaned/
-- =============================================================================

CREATE DATABASE IF NOT EXISTS bda_energy;

USE bda_energy;

CREATE EXTERNAL TABLE IF NOT EXISTS household_power_consumption (
    `timestamp` STRING,
    global_active_power DOUBLE,
    global_reactive_power DOUBLE,
    voltage DOUBLE,
    global_intensity DOUBLE,
    sub_metering_1 DOUBLE,
    sub_metering_2 DOUBLE,
    sub_metering_3 DOUBLE,
    `date` STRING,
    `hour` INT,
    `day` INT,
    `month` INT,
    `year` INT
)
ROW FORMAT DELIMITED
FIELDS TERMINATED BY ','
STORED AS TEXTFILE
LOCATION '/user/bda/energy/cleaned/'
TBLPROPERTIES (
    "skip.header.line.count"="1",
    "serialization.null.format"=""
);
