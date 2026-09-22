# ADR-005: Apache Spark Structured Streaming with Kafka and Watermarking

## Status
Accepted

## Context
Smart meter telemetry produces a continuous time-series stream. The platform must compute tumbling (1-minute) and sliding (5-minute) windows to detect immediate load spikes and appliance anomalies while handling out-of-order event arrivals.

## Decision
Utilize **Apache Spark Structured Streaming** (`jobs/streaming/spark_stream_processor.py`) connected to Apache Kafka:
- **Kafka Ingestion**: Subscribes to topic `energy-events`.
- **Watermarking**: Applies `withWatermark("timestamp", "10 minutes")` to accept bounded late arrivals and prune state store memory.
- **Window Aggregations**: Computes 1-minute tumbling windows and 5-minute sliding windows (slide interval 1 minute).
- **Sink Strategy**: Idempotent upsert to MongoDB `stream_windows` via `foreachBatch`.
- **Client Live Feed**: `stream-service` provides a lightweight historical replayer and Server-Sent Events (SSE) `/api/v1/stream/live` endpoint for browser streaming without WebSocket connection overhead.

## Consequences
- **Positive**: Strict exactly-once processing guarantees; automated memory management via watermarks; seamless browser integration via SSE.
- **Negative**: Requires Kafka and Spark runtime coordination in production.
