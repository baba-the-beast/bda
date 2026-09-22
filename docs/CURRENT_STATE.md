# Current State Architecture & Engineering Assessment

## 1. Executive Summary
The Big Data Energy Consumption Analytics Platform is designed to process, analyze, and visualize high-frequency time-series power consumption data from the UCI Individual Household Electric Power Consumption dataset (~2,075,259 measurements collected at 1-minute intervals between December 2006 and November 2010 in Sceaux, France).

The platform accommodates two deployment targets sharing identical domain contracts:
1. **FULL_BDA Mode**: Distributed production architecture targeting Kubernetes / Hadoop cluster environments utilizing HDFS, Hadoop MapReduce (Streaming), Apache Hive, Spark Structured Streaming, and MongoDB.
2. **RENDER_LITE Mode**: Optimized three-service architecture (`frontend`, `backend-api`, `bda-processor`) running bounded-memory chunked streaming aggregations and DuckDB analytical query execution without monolithic cluster dependencies.

---

## 2. Microservice & Topology Map

```
                             +-----------------------+
                             |   React / Vite SPA    |
                             |      (Frontend)       |
                             +-----------+-----------+
                                         |
                                         | HTTP / SSE
                                         v
                             +-----------------------+
                             |  API Gateway / Router  |
                             |      (Port 8000)      |
                             +-----------+-----------+
                                         |
         +-------------------------------+-------------------------------+
         |               |               |               |               |
         v               v               v               v               v
+----------------+ +------------+ +-------------+ +-------------+ +-------------+
|  Auth Service  | |  Dataset   | | Preprocess  | |  Batch Job  | | Hive Query  |
|  (Argon2/JWT)  | |  Service   | |   Service   | | Orchestrator| |   Service   |
+----------------+ +------------+ +-------------+ +-------------+ +-------------+
         |               |               |               |               |
         +---------------+---------------+---------------+---------------+
                                         |
                                         v
                             +-----------------------+
                             | Stream Telemetry Svc  |
                             |   (1m/5m Windows)     |
                             +-----------+-----------+
                                         |
         +-------------------------------+-------------------------------+
         |                                                               |
         v                                                               v
+------------------+                                           +------------------+
| MongoDB Storage  |                                           | Distributed HDFS |
| (Analytical Read |                                           |  (Raw, Cleaned,  |
|      Models)     |                                           |     Outputs)     |
+------------------+                                           +------------------+
```

### Registered Services & Responsibilities
| Service Name | Port | Primary Responsibility | Backing Store |
|---|---|---|---|
| **api-gateway** | 8000 | Reverse proxy, route dispatch, TLS termination, CORS | In-memory router |
| **auth-service** | 8001 | Identity, Argon2id hashing, JWT access/refresh lifecycle, RBAC, audit logging | MongoDB `users`, `user_sessions`, `audit_logs` |
| **dataset-service** | 8002 | Dataset ingestion, SHA-256 validation, schema structure checks, raw HDFS upload | HDFS `/raw`, MongoDB `datasets` |
| **preprocessing-service**| 8003 | Bounded-memory cleaning, missing value isolation, outlier checks, cleaned HDFS persistence | HDFS `/cleaned`, `/rejected`, MongoDB metadata |
| **job-orchestrator** | 8004 | MapReduce job dispatch, idempotency checking, worker thread pool execution | HDFS `/output`, MongoDB `analytics_jobs` |
| **hive-query-service** | 8005 | HiveQL analytical templates, SQL injection validation, tabular execution | HDFS cleaned CSV, DuckDB / HiveServer2 |
| **analytics-service** | 8006 | Daily, hourly, monthly, peak aggregates API, CSV/JSON authenticated exports | MongoDB analytical collections |
| **stream-service** | 8007 | Smart meter replay simulator, tumbling 1m & sliding 5m windows, authenticated SSE | MongoDB `stream_windows`, SSE broadcast |

---

## 3. Storage & HDFS Logical Hierarchy

All storage adheres to strict hierarchical namespacing:
```
/user/bda/energy/
  ├── raw/
  │    └── {dataset_id}/
  │         └── household_power_consumption.txt    # Authentic raw UCI data
  ├── cleaned/
  │    └── {dataset_id}/
  │         └── part-00000.csv                    # Sanitized CSV (13 columns)
  ├── output/
  │    ├── daily/{run_id}/part-00000              # Daily totals, averages, sub-meters
  │    ├── hourly/{run_id}/part-00000             # 24-hour diurnal patterns
  │    ├── monthly/{run_id}/part-00000            # Month/year longitudinal totals
  │    └── peak/{run_id}/part-00000               # Peak load events (> threshold)
  └── rejected/
       └── {dataset_id}/
            └── rejected_records.log              # Records with '?' or invalid syntax
```

---

## 4. Dataset Specification
- **Dataset Title**: UCI Individual Household Electric Power Consumption
- **Origin**: Electric power consumption in one household with a one-minute sampling rate over a period of almost 4 years.
- **Physical Archive**: `individual+household+electric+power+consumption.zip` (~20.6 MB)
- **Uncompressed Text**: `household_power_consumption.txt` (132,960,755 bytes)
- **Total Measurements**: 2,075,259 data rows (+ 1 header row = 2,075,260 total lines)
- **Missing Values**: 25,979 rows (1.25%) contain `?` for power measurements and are routed to rejected logs during sanitization.
- **Valid Rows**: 2,049,280 clean rows adhering to physical bounds.
- **Columns (Raw)**:
  1. `Date` (dd/mm/yyyy)
  2. `Time` (hh:mm:ss)
  3. `Global_active_power` (household global active power in kilowatt)
  4. `Global_reactive_power` (household global reactive power in kilowatt)
  5. `Voltage` (minute-averaged voltage in volt)
  6. `Global_intensity` (household global current intensity in ampere)
  7. `Sub_metering_1` (kitchen: dishwasher, microwave in watt-hour)
  8. `Sub_metering_2` (laundry room: washing machine, dryer, refrigerator in watt-hour)
  9. `Sub_metering_3` (electric water heater, air conditioning in watt-hour)

---

## 5. Security & Isolation Model
- **Authentication**: Stateless JWT access tokens (15-minute TTL) with cryptographic signature validation. Refresh tokens (7-day TTL) tracked in MongoDB session store for one-time rotation and immediate revocation upon logout.
- **Password Storage**: Modern Argon2id password hashing algorithm.
- **Role Hierarchy**:
  - `ADMIN`: User management, dataset deletion, full analytical access, audit and security log inspection.
  - `ANALYST`: Dataset upload, preprocessing trigger, MapReduce job execution, stream simulation control, analytical queries and exports.
  - `VIEWER`: Read-only access to analytical read models, Hive query templates, and live telemetry feeds.
- **Multi-Tenancy**: Strict workspace filtering across dataset lookups, batch jobs, and analytical results to prevent Insecure Direct Object References (IDOR).
