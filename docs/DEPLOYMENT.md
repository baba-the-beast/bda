# Deployment Specification & Infrastructure Operations

## 1. Deployment Topologies

The platform supports two deployment topologies:
1. **Docker Compose**: Suitable for local multi-container evaluation and staging without Kubernetes overhead.
2. **Kubernetes & Helm**: Production-grade, cloud-native orchestration with high availability, horizontal autoscaling (HPA), zero-trust network segmentation, and non-root security.

---

## 2. Docker Compose Deployment

The root `docker-compose.yml` orchestrates the complete 13-container topology:
- Infrastructure: `mongodb` (7.0), `redis` (7.0), `zookeeper` (3.8), `kafka` (3.5)
- Microservices: `api-gateway`, `auth-service`, `dataset-service`, `preprocessing-service`, `job-orchestrator`, `hive-query-service`, `analytics-service`, `stream-service`
- Frontend: `frontend` (Nginx serving React 18 production bundle)

### Starting the Stack
```bash
# Copy and adjust environment secrets
cp .env.example .env

# Build and start all services in background
docker compose up -d --build

# Verify container health
docker compose ps

# View unified container logs
docker compose logs -f api-gateway
```

### Stopping the Stack
```bash
docker compose down -v
```

---

## 3. Kubernetes Native Deployment (`infrastructure/kubernetes/base/`)

The Kubernetes manifests adhere strictly to Cloud Native Computing Foundation (CNCF) and CIS Kubernetes Benchmark standards.

### 3.1 Applying Manifests
```bash
# 1. Create namespace and RBAC
kubectl apply -f infrastructure/kubernetes/base/namespace.yaml
kubectl apply -f infrastructure/kubernetes/base/rbac.yaml

# 2. Deploy ConfigMaps and Secrets
kubectl apply -f infrastructure/kubernetes/base/configmap.yaml
kubectl apply -f infrastructure/kubernetes/base/secrets.yaml

# 3. Apply Zero-Trust Network Policies (Default Deny)
kubectl apply -f infrastructure/kubernetes/base/network-policy.yaml

# 4. Deploy Stateful Data Stores
kubectl apply -f infrastructure/kubernetes/base/mongodb-statefulset.yaml
kubectl apply -f infrastructure/kubernetes/base/redis-deployment.yaml

# 5. Deploy Microservices & Ingress
kubectl apply -f infrastructure/kubernetes/base/services-deployment.yaml
kubectl apply -f infrastructure/kubernetes/base/ingress.yaml

# 6. Apply Autoscaling (HPA) & Pod Disruption Budgets (PDB)
kubectl apply -f infrastructure/kubernetes/base/hpa.yaml
kubectl apply -f infrastructure/kubernetes/base/pdb.yaml
```

### 3.2 Security Context Specifications
All pods run under strict unprivileged constraints:
```yaml
securityContext:
  runAsNonRoot: true
  runAsUser: 10001
  runAsGroup: 10001
  fsGroup: 10001
  readOnlyRootFilesystem: true
  allowPrivilegeEscalation: false
  capabilities:
    drop:
      - ALL
```

### 3.3 Horizontal Pod Autoscaling (HPA)
- **Metrics**: Average CPU utilization $\ge 75\%$, Memory utilization $\ge 80\%$.
- **Min Pods**: 2 (per service for high availability).
- **Max Pods**: 10 (for compute-heavy services like `analytics-service` and `stream-service`).

---

## 4. Helm Deployment (`infrastructure/helm/energy-platform/`)

The platform includes a production Helm chart supporting environment segregation:

### 4.1 Dev Environment
```bash
helm upgrade --install energy-platform ./infrastructure/helm/energy-platform \
  --namespace bda-energy --create-namespace \
  -f ./infrastructure/helm/energy-platform/values-dev.yaml
```

### 4.2 Production Environment
```bash
helm upgrade --install energy-platform ./infrastructure/helm/energy-platform \
  --namespace bda-energy --create-namespace \
  -f ./infrastructure/helm/energy-platform/values-prod.yaml \
  --set global.jwtSecret=$PRODUCTION_JWT_SECRET \
  --set global.mongoPassword=$PRODUCTION_MONGO_PASSWORD
```

### 4.3 Helm Chart Structure
```
infrastructure/helm/energy-platform/
  ├── Chart.yaml              # Chart metadata & version (1.0.0)
  ├── values.yaml             # Default configuration
  ├── values-dev.yaml         # Lightweight replica counts for dev
  ├── values-prod.yaml        # High-availability replicas, resource limits, PVCs
  └── templates/
      ├── deployment.yaml     # Microservices parameterized deployments
      ├── service.yaml        # ClusterIP services
      ├── ingress.yaml        # Ingress routing rules
      ├── hpa.yaml            # Horizontal Pod Autoscalers
      └── networkpolicy.yaml  # Default-deny NetworkPolicies
```

---

## 5. Verification & Health Checks

Once deployed, verify cluster status:
```bash
# Check all pods are running and healthy
kubectl get pods -n bda-energy -o wide

# Verify ingress endpoints
curl -k https://energy.bda.internal/health
curl -k https://energy.bda.internal/api/v1/analytics/overview
```
