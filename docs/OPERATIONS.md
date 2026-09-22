# SRE & Operations Runbook

## 1. Routine Operational Procedures

### 1.1 Service Health Probing
Every microservice exposes liveness and readiness endpoints:
```bash
# Check API Gateway
curl -s http://localhost:8000/health | jq .

# Check specific service health via Gateway
curl -s http://localhost:8000/api/v1/auth/health
curl -s http://localhost:8000/api/v1/datasets/health
curl -s http://localhost:8000/api/v1/analytics/health
```

### 1.2 Pod Management & Logs
```bash
# View pod status across namespace
kubectl get pods -n bda-energy -o wide

# Stream real-time logs for a specific service
kubectl logs -n bda-energy -l app=analytics-service -f --tail=100

# Inspect pod descriptions for OOMKilled or CrashLoopBackOff events
kubectl describe pod -n bda-energy <pod-name>
```

---

## 2. Troubleshooting & Incident Runbooks

### Incident 1: High Kafka Consumer Lag in Streaming Layer
- **Symptoms**: Real-time SSE dashboard displays delayed timestamps; Prometheus alert `KafkaConsumerLagHigh` fires.
- **Diagnosis**:
  ```bash
  # Check Spark streaming log or Kafka consumer group lag
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 --describe --group spark-energy-streaming
  ```
- **Remediation**:
  1. Verify Spark Streaming executor memory and CPU limits in Kubernetes.
  2. Scale `stream-service` replicas:
     ```bash
     kubectl scale deployment stream-service --replicas=4 -n bda-energy
     ```
  3. Temporarily throttle the stream simulator playback interval.

### Incident 2: MapReduce Job Stalled or Failed
- **Symptoms**: Job status remains `RUNNING` for $>15$ minutes or transitions to `FAILED`.
- **Diagnosis**:
  ```bash
  # Fetch job details and logs via CLI
  energy job status <job_id>
  
  # Check Job Orchestrator logs
  kubectl logs -n bda-energy -l app=job-orchestrator --tail=200
  ```
- **Remediation**:
  1. Inspect `/user/bda/energy/cleaned/<dataset_id>/clean_data.tsv` for corrupt delimiters.
  2. Verify that local or HDFS scratch space has at least $2 \text{ GB}$ free disk space.
  3. Resubmit the job with idempotent deduplication via CLI or REST API.

### Incident 3: MongoDB Connection Saturation / High Latency
- **Symptoms**: API requests return HTTP 500 or timeout with `ServerSelectionTimeoutError`.
- **Diagnosis**:
  ```bash
  # Connect to MongoDB pod
  mongosh -u bda_user -p bda_password --authenticationDatabase bda_energy
  # Check active connections and slow operations
  db.serverStatus().connections
  db.currentOp({ "secs_running": { "$gt": 2 } })
  ```
- **Remediation**:
  1. Verify compound index health:
     ```javascript
     db.daily_aggregates.getIndexes();
     ```
  2. Check connection pool limits in `shared/database.py` (default: 50 max connections per pod).
  3. Scale MongoDB resources or restart the primary replica.

---

## 3. Rolling Upgrades & Zero-Downtime Releases

All Kubernetes deployments define rolling update strategies to guarantee zero downtime:
```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxSurge: 1
    maxUnavailable: 0
```

To update a service image:
```bash
kubectl set image deployment/analytics-service \
  analytics-service=ghcr.io/bda-org/analytics-service:v1.2.0 \
  -n bda-energy

# Monitor rollout status
kubectl rollout status deployment/analytics-service -n bda-energy

# Rollback if health checks fail
kubectl rollout undo deployment/analytics-service -n bda-energy
```
