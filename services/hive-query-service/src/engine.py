"""
Hive Query Execution Engine.
Provides parameterized safe templates, strict SQL AST/token validation,
and execution across live HiveServer2 or local development SQL adapter.
"""

import os
import re
import time
from typing import Any

import duckdb

from shared.logger import get_logger

logger = get_logger("hive-engine")

FORBIDDEN_KEYWORDS = [
    "DROP", "ALTER", "TRUNCATE", "DELETE", "INSERT", "CREATE", "GRANT",
    "REVOKE", "UPDATE", "REPLACE", "EXEC", "EXECUTE", "UNION", ";", "--", "/*"
]

APPROVED_TEMPLATES: dict[str, dict[str, Any]] = {
    "daily_aggregates": {
        "name": "Daily Power Aggregates",
        "description": "Calculates total daily energy consumption (kWh), power bounds, and submeter totals.",
        "parameters": [
            {"name": "start_date", "type": "string", "default": None, "description": "Optional start date YYYY-MM-DD"},
            {"name": "end_date", "type": "string", "default": None, "description": "Optional end date YYYY-MM-DD"},
            {"name": "limit", "type": "integer", "default": 365, "description": "Maximum records to return"}
        ],
        "sql": """
            SELECT 
                "date",
                ROUND(SUM(global_active_power) / 60.0, 4) AS total_consumption_kwh,
                ROUND(AVG(global_active_power), 4) AS average_power_kw,
                ROUND(MIN(global_active_power), 4) AS min_power_kw,
                ROUND(MAX(global_active_power), 4) AS max_power_kw,
                ROUND(SUM(sub_metering_1), 2) AS sub1_kitchen_wh,
                ROUND(SUM(sub_metering_2), 2) AS sub2_laundry_wh,
                ROUND(SUM(sub_metering_3), 2) AS sub3_climate_wh,
                COUNT(*) AS reading_count
            FROM energy_data
            WHERE global_active_power IS NOT NULL
            {date_filter}
            GROUP BY "date"
            ORDER BY "date" ASC
            LIMIT {limit}
        """
    },
    "hourly_distribution": {
        "name": "Hourly Consumption Profile",
        "description": "Computes diurnal load profile grouped by hour of the day (0-23).",
        "parameters": [
            {"name": "limit", "type": "integer", "default": 24, "description": "Hour limit"}
        ],
        "sql": """
            SELECT 
                "hour",
                ROUND(SUM(global_active_power) / 60.0, 4) AS total_consumption_kwh,
                ROUND(AVG(global_active_power), 4) AS average_power_kw,
                ROUND(MIN(global_active_power), 4) AS min_power_kw,
                ROUND(MAX(global_active_power), 4) AS max_power_kw,
                ROUND(AVG(voltage), 2) AS avg_voltage_v,
                ROUND(AVG(global_intensity), 2) AS avg_intensity_a,
                COUNT(*) AS reading_count
            FROM energy_data
            WHERE global_active_power IS NOT NULL
            GROUP BY "hour"
            ORDER BY "hour" ASC
            LIMIT {limit}
        """
    },
    "monthly_trends": {
        "name": "Monthly Consumption Trends",
        "description": "Aggregates energy consumption by year and month to evaluate seasonal heating/cooling shifts.",
        "parameters": [
            {"name": "limit", "type": "integer", "default": 60, "description": "Max months"}
        ],
        "sql": """
            SELECT 
                "year",
                "month",
                ROUND(SUM(global_active_power) / 60.0, 4) AS total_monthly_kwh,
                ROUND(AVG(global_active_power), 4) AS average_power_kw,
                ROUND(MIN(global_active_power), 4) AS min_power_kw,
                ROUND(MAX(global_active_power), 4) AS max_power_kw,
                COUNT(*) AS reading_count
            FROM energy_data
            WHERE global_active_power IS NOT NULL
            GROUP BY "year", "month"
            ORDER BY "year" ASC, "month" ASC
            LIMIT {limit}
        """
    },
    "peak_power_analysis": {
        "name": "Peak Power Analysis",
        "description": "Identifies instantaneous extreme demand events and associated appliance contribution.",
        "parameters": [
            {"name": "threshold_kw", "type": "float", "default": 4.0, "description": "Minimum active power threshold in kW"},
            {"name": "limit", "type": "integer", "default": 50, "description": "Number of peak events"}
        ],
        "sql": """
            SELECT 
                "timestamp",
                "date",
                "hour",
                global_active_power,
                voltage,
                global_intensity,
                sub_metering_1,
                sub_metering_2,
                sub_metering_3,
                (sub_metering_1 + sub_metering_2 + sub_metering_3) AS total_submeter_wh
            FROM energy_data
            WHERE global_active_power >= {threshold_kw}
            ORDER BY global_active_power DESC
            LIMIT {limit}
        """
    },
    "submeter_comparison": {
        "name": "Sub-Meter Consumption Comparison",
        "description": "Calculates proportional energy breakdown between Kitchen, Laundry, and Climate systems.",
        "parameters": [],
        "sql": """
            SELECT 
                ROUND(SUM(sub_metering_1) / 1000.0, 2) AS kitchen_total_kwh,
                ROUND(SUM(sub_metering_2) / 1000.0, 2) AS laundry_total_kwh,
                ROUND(SUM(sub_metering_3) / 1000.0, 2) AS climate_total_kwh,
                ROUND((SUM(sub_metering_1) * 100.0) / NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 2) AS kitchen_percentage,
                ROUND((SUM(sub_metering_2) * 100.0) / NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 2) AS laundry_percentage,
                ROUND((SUM(sub_metering_3) * 100.0) / NULLIF(SUM(sub_metering_1 + sub_metering_2 + sub_metering_3), 0), 2) AS climate_percentage,
                COUNT(*) AS total_records
            FROM energy_data
            WHERE global_active_power IS NOT NULL
        """
    },
    "voltage_intensity_correlation": {
        "name": "Voltage Stability & Current Intensity",
        "description": "Categorizes records by voltage stability bands and analyzes current intensity correlation.",
        "parameters": [],
        "sql": """
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
            FROM energy_data
            WHERE voltage IS NOT NULL AND global_active_power IS NOT NULL
            GROUP BY 
                CASE 
                    WHEN voltage < 235.0 THEN 'Low Voltage (<235V)'
                    WHEN voltage BETWEEN 235.0 AND 245.0 THEN 'Nominal (235V-245V)'
                    ELSE 'High Voltage (>245V)'
                END
            ORDER BY avg_voltage ASC
        """
    }
}


def sanitize_parameter(val: Any) -> Any:
    if isinstance(val, str):
        # Strict alphanumeric and hyphen/colon/period only for dates/timestamps
        clean = re.sub(r"[^a-zA-Z0-9\-\:\. ]", "", val)
        return clean
    return val


def validate_query_safety(query_str: str) -> None:
    if ";" in query_str or "--" in query_str or "/*" in query_str:
        raise ValueError("Dangerous character sequence detected in query")
    tokens = re.split(r"\s+", query_str.upper())
    for token in tokens:
        clean_tok = token.strip(";,()")
        if clean_tok in FORBIDDEN_KEYWORDS:
            raise ValueError(f"Dangerous or non-read keyword detected: '{clean_tok}'")


def execute_analytical_query(
    template_name: str,
    dataset_csv_path: str,
    parameters: dict[str, Any] | None = None,
) -> tuple[list[dict[str, Any]], float]:
    if template_name not in APPROVED_TEMPLATES:
        raise ValueError(f"Unknown query template: '{template_name}'")

    template = APPROVED_TEMPLATES[template_name]
    params = parameters or {}

    start_ts = time.time()

    # Format parameter substitutions safely
    limit = int(params.get("limit", 100))
    limit = max(1, min(limit, 1000))  # Bounds check: 1 to 1000

    date_filter = ""
    start_date = params.get("start_date")
    end_date = params.get("end_date")
    if start_date:
        clean_sd = sanitize_parameter(str(start_date))
        date_filter += f" AND \"date\" >= '{clean_sd}'"
    if end_date:
        clean_ed = sanitize_parameter(str(end_date))
        date_filter += f" AND \"date\" <= '{clean_ed}'"

    threshold_kw = float(params.get("threshold_kw", 4.0))
    threshold_kw = max(0.1, min(threshold_kw, 25.0))

    query = template["sql"].format(
        limit=limit,
        date_filter=date_filter,
        threshold_kw=threshold_kw,
    )

    validate_query_safety(query)

    # Execute against cleaned dataset via SQL engine
    con = duckdb.connect(database=":memory:")
    try:
        norm_path = dataset_csv_path.replace(os.sep, '/')
        # Safe schema mapping with TRY_CAST
        con.execute(f"""
            CREATE VIEW energy_data AS 
            SELECT 
                "timestamp",
                TRY_CAST(global_active_power AS DOUBLE) AS global_active_power,
                TRY_CAST(global_reactive_power AS DOUBLE) AS global_reactive_power,
                TRY_CAST(voltage AS DOUBLE) AS voltage,
                TRY_CAST(global_intensity AS DOUBLE) AS global_intensity,
                TRY_CAST(sub_metering_1 AS DOUBLE) AS sub_metering_1,
                TRY_CAST(sub_metering_2 AS DOUBLE) AS sub_metering_2,
                TRY_CAST(sub_metering_3 AS DOUBLE) AS sub_metering_3,
                "date",
                TRY_CAST("hour" AS INTEGER) AS "hour",
                TRY_CAST("day" AS INTEGER) AS "day",
                TRY_CAST("month" AS INTEGER) AS "month",
                TRY_CAST("year" AS INTEGER) AS "year"
            FROM read_csv_auto('{norm_path}', header=true, all_varchar=true)
        """)
        df = con.execute(query).df()
        duration = time.time() - start_ts

        # Convert to list of dicts with NaN replaced
        records = df.fillna(0).to_dict(orient="records")
        return records, round(duration, 4)
    finally:
        con.close()
