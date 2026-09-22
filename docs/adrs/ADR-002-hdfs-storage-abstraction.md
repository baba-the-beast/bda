# ADR-002: HDFS Storage Abstraction Layer & Tiered Partitioning

## Status
Accepted

## Context
The platform requires distributed storage for large raw files, cleaned records, intermediate MapReduce part files, and quarantined anomalies. Direct dependency on a live Hadoop cluster complicates local developer workflows and automated CI pipelines, while a naive local-only filesystem fails production deployment requirements.

## Decision
Implement a pluggable `HdfsClient` abstraction (`shared/hdfs.py`) that presents an identical interface regardless of execution environment:
- In staging/production: `WebHdfsClient` communicates via HTTP REST API (`/webhdfs/v1`) with the Hadoop NameNode.
- In local development/testing: `LocalHdfsClient` emulates the distributed filesystem hierarchy on disk (`data/hdfs/`).

Enforce a strictly standardized directory partitioning scheme:
- `/user/bda/energy/raw/<dataset_id>/`: Immutable raw source data.
- `/user/bda/energy/cleaned/<dataset_id>/`: Validated, preprocessed tab-separated values (TSV).
- `/user/bda/energy/output/<job_id>/`: MapReduce execution output part files.
- `/user/bda/energy/rejected/<dataset_id>/`: Quarantined missing and invalid records.

## Consequences
- **Positive**: Zero external infrastructure friction during local unit and integration testing; seamless transition to real Hadoop clusters in production via configuration.
- **Negative**: Need to maintain feature parity between the local mock and live WebHDFS client.
