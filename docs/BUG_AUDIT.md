# Comprehensive Bug & Security Audit Report

## 1. Audit Methodology & Scope
This audit catalogs architectural flaws, security vulnerabilities, silent failovers, data calculation inaccuracies, and frontend contract breaks identified during the codebase inspection of the Big Data Energy Consumption Analytics Platform (`d:\bda`).

---

## 2. Issue Severity Classification

### CRITICAL Severity

#### BUG-CRIT-01: Privilege Escalation in User Self-Registration
- **Location**: `services/auth-service/src/main.py:154-189`, `shared/models.py:55-58`
- **Root Cause**: The `/api/v1/auth/register` endpoint accepted `UserCreate`, which inherited `role: UserRole` and `workspace_id: str` from `UserBase`. A public registrant could pass `{"role": "ADMIN", "workspace_id": "system"}` in the registration JSON, escalating immediately to full cluster administrator privileges.
- **Remediation**: Replaced input model with `PublicRegistrationRequest`, which accepts strictly `email`, `full_name`, and `password`. The role is hardcoded to `UserRole.ANALYST` and workspace is constrained. Only existing admins can promote users.

#### BUG-CRIT-02: Hardcoded Production Secrets and Predictable Master Credentials
- **Location**: `shared/security.py:19`, `services/auth-service/src/main.py:59-72`, `docker-compose.yml:78-79`
- **Root Cause**: `shared/security.py` fell back to `"super-secret-production-key-must-be-rotated-in-production-env-32bytes"`. On application boot, `auth-service` seeded `admin@bda-energy.internal` with hardcoded password `AdminPass123!`.
- **Remediation**: In production, the system must fail closed if `JWT_SECRET` is unset or matches known insecure default keys. Account seeding is strictly guarded behind `ENABLE_DEMO_SEED=true` (disabled by default).

#### BUG-CRIT-03: Silent Datastore Fallback to Ephemeral In-Memory Cache
- **Location**: `shared/database.py:51-55`, `shared/repository.py:41-380`
- **Root Cause**: When `get_database()` failed to establish a MongoDB connection, repository operations caught no exception and silently wrote to/read from an in-memory dictionary (`_local_store`). In production, this creates a false sense of health while silently losing all persisted state upon container restart.
- **Remediation**: Fail closed with `DatabaseConnectionException` when `DATA_STORE_MODE=mongodb` (the default). In-memory operation is allowed only when explicitly configured via `DATA_STORE_MODE=memory`.

#### BUG-CRIT-04: Arbitrary Local Path Ingestion (Path Traversal / Local File Inclusion)
- **Location**: `services/dataset-service/src/main.py:191-245`
- **Root Cause**: The endpoint `/api/v1/datasets/import-local` accepted arbitrary `file_path` from user input with only `os.path.exists` validation. An attacker with Analyst credentials could read sensitive OS files or arbitrary disk locations into HDFS and download them.
- **Remediation**: Canonicalize paths using `os.path.realpath` and enforce that targets must reside strictly within allowlisted project data directories (`d:\bda\data` and verified project roots). Reject any attempt using relative traversals or unapproved root paths.

---

### HIGH Severity

#### BUG-HIGH-01: Fake WebHDFS Client with Silent Local Disk Fallback
- **Location**: `shared/hdfs.py:106-142`
- **Root Cause**: `WebHDFSClient` merely constructed a `urllib.request.Request` object without executing it and unconditionally delegated to `LocalHDFSAdapter`. In `FULL_BDA` mode, WebHDFS must be a genuine distributed client.
- **Remediation**: Implement authentic WebHDFS HTTP REST semantics (NameNode PUT request, capture 307 temporary redirect `Location` header to DataNode, stream file data). Fail closed if Hadoop NameNode/DataNodes are unreachable in `FULL_BDA` mode.

#### BUG-HIGH-02: Missing Refresh Token Revocation and Session Hijacking Risk
- **Location**: `services/auth-service/src/main.py:250-295`, `shared/security.py:91-107`
- **Root Cause**: Refresh tokens were verified solely via stateless cryptographic signature decoding. The `/api/v1/auth/logout` endpoint logged an audit event without revoking or invalidating the token. If an attacker obtained a refresh token, they could continuously refresh it until the 7-day expiration with no mechanism to revoke it.
- **Remediation**: Store active session records in MongoDB (`user_sessions` collection) indexed by `jti`. Rotate refresh tokens on every refresh and invalidate old `jti`s. Revoke active sessions on logout.

#### BUG-HIGH-03: Industrial Substation SCADA Bleed-Through in Household Energy UI
- **Location**: `frontend/src/pages/stitch/SubstationScreen.tsx:1-247`
- **Root Cause**: The screen displayed fake industrial substation telemetry ("EMERGENCY SCADA TRIP INTERLOCK", "BUS TIE BREAKER 52-1", "25 MVA Transformer Loading Ratio", "18.24 MW 3-Phase Vectors"), which completely contradicted the UCI Individual Household dataset.
- **Remediation (2026-09, corrected)**: The original entry claimed this was resolved, but
  only the worst copy had been removed. The file was still `SubstationScreen.tsx`, the
  sidebar still read "Transformer Substation", and the table read `row.band` / `row.count`
  while the API sends `voltage_band` / `reading_count` — so it rendered fabricated figures
  when the query failed and two blank columns when it succeeded. Fully replaced by
  `src/features/voltage/VoltagePage.tsx`; see `docs/FRONTEND_AUDIT.md` F1.
- **Original remediation note**: Replaced screen with legitimate household **Voltage & Power Analysis** ($P \approx V \cdot I \cdot \cos\phi$, Voltage stability bands: <230V, 230-240V, 240-250V, >250V, current intensity correlation).

#### BUG-HIGH-04: Truncated Dataset Aggregation Limits in Overview & Submeter Analytics
- **Location**: `services/analytics-service/src/main.py:140-195`, `shared/repository.py:210`
- **Root Cause**: `get_overview_summary` called `Repository.get_daily_aggregates(target_ds_id)` which defaulted to `limit=365`. The UCI dataset spans 1,442 days (Dec 2006 to Nov 2010). Consequently, `total_consumption_kwh` ignored ~75% of the dataset's total energy, and `get_submeter_comparison` used `limit=1000`, truncating 442 days of energy disaggregation.
- **Remediation**: Remove artificial day limits from dataset-wide summaries; calculate global sums and weighted averages across the full longitudinal dataset.

---

### MEDIUM Severity

#### BUG-MED-01: Broken Live SSE Telemetry Feed in Stitch Screen
- **Location**: `frontend/src/pages/stitch/LiveTelemetryScreen.tsx:54`, `services/stream-service/src/simulator.py:172-177`
- **Root Cause**: `simulator.py` broadcast payloads structured as `{"type": "TELEMETRY", "reading": {...}}`. `LiveTelemetryScreen.tsx` checked `data.global_active_power !== undefined` directly at the root, which was always `undefined`. Furthermore, `api.ts` registered `es.onmessage`, which ignores SSE events dispatched with custom event names (`event: telemetry`).
- **Remediation**: Standardized SSE client to listen to `addEventListener('telemetry', ...)` and updated data access to handle both `data.reading` and flattened properties.

#### BUG-MED-02: Hardcoded Localhost URLs and Mock Dataset IDs in Frontend
- **Location**: `frontend/src/pages/stitch/LoadProfileScreen.tsx:45`, `frontend/src/api.ts:210-216`
- **Root Cause**: `LoadProfileScreen.tsx` performed `fetch('http://localhost:8000/api/v1/analytics/export?format=csv')`, which breaks when deployed on remote servers or Render. `api.ts` had fallback default argument `'ds-sample-1234'`.
- **Remediation**: Unified all API calls through the centralized `ApiClient` using relative URLs or configurable base paths, and bound queries to the user's active dataset state.

#### BUG-MED-03: Insecure Unauthenticated Exports via `window.open`
- **Location**: `frontend/src/pages/BatchAnalyticsPage.tsx:73-75`
- **Root Cause**: `window.open(url, '_blank')` sends a browser GET request without the `Authorization: Bearer <token>` header, failing on authenticated export endpoints.
- **Remediation**: Replaced with authenticated fetch that receives a binary Blob, creates an object URL, and triggers client-side download.

#### BUG-MED-04: API Contract Property Mismatches
- **Location**: `frontend/src/pages/stitch/LoadProfileScreen.tsx:71`, `frontend/src/pages/stitch/SubMeterScreen.tsx:24-26`, `services/hive-query-service/src/main.py:116`
- **Root Cause**:
  1. `LoadProfileScreen.tsx` looked for `overview?.total_energy_kwh` instead of `overview?.total_consumption_kwh`.
  2. `SubMeterScreen.tsx` accessed `d.sub_metering_1` instead of `d.sub_metering_1_total`.
  3. `hive-query-service` returned `results`, while Stitch screens expected `records`.
- **Remediation**: Aligned frontend property access and provided dual aliases (`results` and `records`) in `QueryExecutionResponse`.

---

### LOW Severity

#### BUG-LOW-01: Excessive MongoDB Writes in Streaming Simulator
- **Location**: `services/stream-service/src/simulator.py:170`
- **Root Cause**: On every emitted telemetry record (e.g. 5-100 times per second), a rolling window document was written to MongoDB, creating write amplification and high I/O churn.
- **Remediation**: Window persistence is now batched to boundary intervals (tumbling 1m window boundaries or throttled intervals).

#### BUG-LOW-02: Lack of Compound MongoDB Indexes
- **Location**: `shared/repository.py:19-35`
- **Root Cause**: Mongo collections lacked explicit compound indexes on `(dataset_id, date)` and `(dataset_id, hour)`, causing collscans during high-volume query access.
- **Remediation**: Added automated index provisioning upon database client connection.
