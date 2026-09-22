# ADR-001: Microservices Architecture vs. Monolith

## Status
Accepted

## Context
The Big Data Energy Consumption Analytics Platform must ingest, preprocess, batch process (Hadoop MapReduce, Hive), stream process (Kafka, Spark), and serve analytics for over 2.07 million smart meter records. A monolithic codebase would blur bounded contexts, couple batch compute cycles to client HTTP request cycles, and make independent horizontal scaling of compute-intensive components impossible.

## Decision
Decompose the platform into 8 isolated microservices fronted by an API Gateway:
1. `api-gateway` (Port 8000)
2. `auth-service` (Port 8001)
3. `dataset-service` (Port 8002)
4. `preprocessing-service` (Port 8003)
5. `job-orchestrator` (Port 8004)
6. `hive-query-service` (Port 8005)
7. `analytics-service` (Port 8006)
8. `stream-service` (Port 8007)

Each service runs in its own non-root container with dedicated endpoints, configuration, and dependencies.

## Consequences
- **Positive**: Clear separation of concerns; independent scalability (e.g. scaling `analytics-service` independently of `dataset-service`); fault isolation (a crash in Spark streaming does not bring down the Auth API).
- **Negative**: Network hop latency and distributed transaction tracking required (mitigated via `X-Correlation-ID` and unified dev server orchestrator).
