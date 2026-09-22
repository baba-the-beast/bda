# API Specification & Endpoint Reference

## 1. Overview & Conventions

All platform services expose RESTful APIs following JSON-over-HTTP conventions, with streaming data served over Server-Sent Events (SSE).

### 1.1 Base URL & Pathing
- Local Development Gateway: `http://localhost:8000/api/v1`
- Production Kubernetes Ingress: `https://energy.bda.internal/api/v1`

### 1.2 Headers
- `Authorization`: Bearer `<JWT_TOKEN>` (required for all protected routes).
- `X-Correlation-ID`: Client-provided or Gateway-injected UUID (e.g. `c7a4e672-87ef-4b47-9dc4-83956bf3a948`) logged across all distributed spans.
- `Content-Type`: `application/json` (or `multipart/form-data` for file uploads).

### 1.3 Error Format (RFC 7807)
All error responses adhere to the standard schema:
```json
{
  "error": {
    "code": "AUTHENTICATION_FAILED",
    "message": "Invalid credentials provided",
    "request_id": "c7a4e672-87ef-4b47-9dc4-83956bf3a948",
    "details": []
  }
}
```

---

## 2. Authentication Service (`:8001`)

### `POST /api/v1/auth/login`
- **Access**: Public (rate-limited to 10 req/min).
- **Request Body**:
  ```json
  { "username": "analyst@bda-energy.internal", "password": "AnalystPass123!" }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "access_token": "eyJhbGci...",
    "refresh_token": "eyJhbGci...",
    "token_type": "bearer",
    "expires_in": 900,
    "user": {
      "id": "u-1234",
      "email": "analyst@bda-energy.internal",
      "full_name": "Senior Energy Analyst",
      "role": "ANALYST"
    }
  }
  ```

### `POST /api/v1/auth/refresh`
- **Access**: Public.
- **Request Body**: `{ "refresh_token": "..." }`
- **Response** (`200 OK`): Refreshed `{ access_token, expires_in: 900 }`.

### `GET /api/v1/auth/me`
- **Access**: Authenticated (`VIEWER`, `ANALYST`, `ADMIN`).
- **Response** (`200 OK`): Current user profile and role claims.

### `GET /api/v1/auth/audit-logs`
- **Access**: Restricted (`ADMIN`).
- **Query Params**: `limit=50`, `offset=0`, `actor_id=...`
- **Response** (`200 OK`): Array of audit log events.

---

## 3. Dataset Service (`:8002`)

### `POST /api/v1/datasets/upload`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Content-Type**: `multipart/form-data` (form field: `file`).
- **Response** (`201 Created`):
  ```json
  {
    "dataset_id": "ds-e48f7b2c",
    "filename": "household_power_consumption.txt",
    "file_size_bytes": 132962456,
    "sha256_checksum": "a8f9c1...",
    "raw_hdfs_path": "/user/bda/energy/raw/ds-e48f7b2c/data.txt",
    "status": "UPLOADED",
    "created_at": "2026-09-18T08:00:00Z"
  }
  ```

### `POST /api/v1/datasets/import-local`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Request Body**: `{ "file_path": "data/sample.txt" }`
- **Response** (`201 Created`): Dataset metadata.

### `GET /api/v1/datasets`
- **Access**: Authenticated.
- **Response** (`200 OK`): List of registered datasets.

---

## 4. Preprocessing Service (`:8003`)

### `POST /api/v1/preprocess/{dataset_id}`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Description**: Streams raw file from HDFS, filters missing `'?'` records, parses dates, validates physical bounds, writes cleaned data to `/cleaned` and rejected data to `/rejected`.
- **Response** (`200 OK`):
  ```json
  {
    "dataset_id": "ds-e48f7b2c",
    "status": "CLEANED",
    "total_records": 20160,
    "valid_records": 19890,
    "rejected_records": 270,
    "cleaned_path": "/user/bda/energy/cleaned/ds-e48f7b2c/clean_data.tsv",
    "rejected_path": "/user/bda/energy/rejected/ds-e48f7b2c/rejected_records.csv"
  }
  ```

### `GET /api/v1/preprocess/{dataset_id}/report`
- **Access**: Authenticated.
- **Response** (`200 OK`): Full `DataQualityReport` including missing value percentages, voltage stability range, active vs reactive power bounds.

---

## 5. Job Orchestrator (`:8004`)

### `POST /api/v1/jobs/submit`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Request Body**:
  ```json
  {
    "dataset_id": "ds-e48f7b2c",
    "job_type": "DAILY",
    "parameters": { "threshold_kw": 5.0 }
  }
  ```
- **Response** (`202 Accepted`):
  ```json
  {
    "job_id": "job-mr-789a1c2",
    "dataset_id": "ds-e48f7b2c",
    "job_type": "DAILY",
    "status": "QUEUED",
    "submitted_at": "2026-09-18T08:05:00Z"
  }
  ```

### `GET /api/v1/jobs/{job_id}`
- **Access**: Authenticated.
- **Response** (`200 OK`): Job status (`RUNNING`, `COMPLETED`, `FAILED`), execution duration, and output summary.

### `GET /api/v1/jobs/{job_id}/results`
- **Access**: Authenticated.
- **Response** (`200 OK`): Output records parsed directly from HDFS or MongoDB read-models.

---

## 6. Hive Query Service (`:8005`)

### `GET /api/v1/hive/templates`
- **Access**: Authenticated.
- **Response** (`200 OK`): List of approved analytical query templates with parameter specs.

### `POST /api/v1/hive/execute`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Request Body**:
  ```json
  {
    "template_name": "daily_aggregates",
    "dataset_id": "ds-e48f7b2c",
    "parameters": { "limit": 30 }
  }
  ```
- **Response** (`200 OK`):
  ```json
  {
    "query_id": "hive-98fa2b",
    "template_name": "daily_aggregates",
    "execution_time_seconds": 0.042,
    "row_count": 30,
    "columns": ["date", "total_consumption_kwh", "average_power_kw", ...],
    "records": [...]
  }
  ```

---

## 7. Analytics Service (`:8006`)

### `GET /api/v1/analytics/overview`
- **Access**: Authenticated.
- **Response** (`200 OK`): High-level platform KPIs (total records processed, total energy kWh, average load, peak power recorded, active anomalies).

### `GET /api/v1/analytics/daily?dataset_id=...`
- **Access**: Authenticated.
- **Response** (`200 OK`): Time-series daily energy rollups, kitchen/laundry/climate Wh.

### `GET /api/v1/analytics/hourly?dataset_id=...`
- **Access**: Authenticated.
- **Response** (`200 OK`): Diurnal 24-hour profile (00:00 to 23:00) with average kW and voltage.

### `GET /api/v1/analytics/peak?dataset_id=...`
- **Access**: Authenticated.
- **Response** (`200 OK`): Outlier peak load events with appliance breakdown.

### `GET /api/v1/analytics/project-metrics?dataset_id=...`
- **Access**: Authenticated.
- **Response** (`200 OK`): Blueprint-specific metrics (Requirement 65: Daily Total Consumption, Global Active Avg, Peak Spike Thresholds, Sub-meter Attribution).

### `GET /api/v1/analytics/export?format=csv&dataset_id=...`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Response** (`200 OK`): Streamed CSV file download.

---

## 8. Stream Service (`:8007`)

### `POST /api/v1/stream/start`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Request Body**: `{ "interval_ms": 100, "anomaly_rate": 0.05 }`
- **Response** (`200 OK`): `{ "status": "STREAMING", "interval_ms": 100 }`

### `POST /api/v1/stream/stop`
- **Access**: Restricted (`ANALYST`, `ADMIN`).
- **Response** (`200 OK`): `{ "status": "STOPPED" }`

### `GET /api/v1/stream/status`
- **Access**: Authenticated.
- **Response** (`200 OK`): Current stream simulator state, emitted count, last timestamp.

### `GET /api/v1/stream/live`
- **Access**: Public / Authenticated.
- **Content-Type**: `text/event-stream`
- **Protocol**: Server-Sent Events (SSE). Streams real-time power readings, rolling 1-minute window metrics, and peak anomaly alerts as JSON chunks:
  ```
  event: energy_telemetry
  data: {"timestamp": "2007-01-01 14:32:00", "global_active_power": 4.218, "voltage": 239.5, "anomaly": false}
  ```
