# ADR-009: Prometheus & Grafana Observability with Domain Metric Instrumentation

## Status
Accepted

## Context
Operating distributed big data pipelines and microservices requires deep visibility into request latencies, failure rates, pipeline queue depths, and streaming throughput. Black-box monitoring is insufficient to diagnose bottlenecks in MapReduce tasks or Kafka lag.

## Decision
1. Instrument all 8 microservices with `prometheus_client` exposing `/metrics`:
   - Standard RED metrics (`http_requests_total`, `http_request_duration_seconds`).
   - Domain-specific metrics (`datasets_uploaded_total`, `records_preprocessed_total`, `mapreduce_jobs_total`, `hive_queries_total`, `stream_records_processed_total`, `stream_anomalies_total`).
2. Deploy pre-configured Prometheus scrape configuration and Alertmanager rules (`infrastructure/monitoring/alerts.yaml`).
3. Provide a complete Grafana dashboard definition (`infrastructure/monitoring/grafana-dashboard.json`) rendering both operational and energy analytics KPIs.
4. Enforce structured JSON logging with `X-Correlation-ID` across all components.

## Consequences
- **Positive**: Complete 360-degree observability across SRE signals and Big Data domain workflows; automated alert notifications.
- **Negative**: Adds negligible memory overhead (~5 MB per pod) for metric collectors.
