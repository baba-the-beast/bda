# ADR-006: MongoDB Document Model for Analytical Read-Models

## Status
Accepted

## Context
Serving pre-aggregated MapReduce outputs, Hive query results, real-time stream windows, and audit trails to web clients requires low-latency queries with flexible schema attributes (e.g. variable appliance sub-meters, data quality metrics). A relational database would require complex joins and schema migrations for semi-structured reports.

## Decision
Adopt **MongoDB 7.0** as the primary serving and metadata datastore:
- Pre-aggregated documents: `daily_aggregates`, `hourly_aggregates`, `monthly_aggregates`, `peak_analyses`.
- Compound unique indexes: `{ dataset_id: 1, date: 1 }` prevents duplicate records during pipeline reruns.
- Automatic data expiration: TTL index on `stream_windows` `{ window_end: 1 }` automatically cleans up real-time telemetry after 48 hours.
- In-memory repository fallback: `shared/repository.py` provides a thread-safe dictionary fallback for isolated testing when MongoDB daemon is offline.

## Consequences
- **Positive**: Sub-millisecond reads for frontend KPI queries; schema flexibility for data quality reports; automated TTL cleanup.
- **Negative**: No distributed ACID multi-document transactions across collections (not needed for pre-computed aggregates).
