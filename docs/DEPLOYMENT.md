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

---

## 6. Hosted Demo: Render (API) + Vercel (Frontend)

The cheapest public deployment: the API as one free Render web service, the
React build on Vercel, and MongoDB on a free Atlas cluster.

### 6.1 MongoDB Atlas
1. Create a free M0 cluster and a database user.
2. Under Network Access, allow `0.0.0.0/0` (Render's free plan has no fixed outbound IP).
3. Copy the connection string (`mongodb+srv://...`).

### 6.2 Render (backend API)
1. New → Blueprint → select this repository. `render.yaml` defines a single
   free web service, `bda-backend-api`.
2. When prompted, set `MONGO_URI` to the Atlas string. Leave
   `CORS_ALLOWED_ORIGINS` empty for now.
3. After the deploy, check `https://<service>.onrender.com/health`.

### 6.3 Vercel (frontend)
1. New Project → select this repository, set **Root Directory** to `frontend`.
   `frontend/vercel.json` supplies the build command, output directory and
   the SPA rewrite.
2. Add the environment variable `VITE_API_URL` = `https://<service>.onrender.com`
   (the client appends `/api/v1`). It is read at build time, so redeploy after
   changing it.

### 6.4 Connect the two
Back in Render, set `CORS_ALLOWED_ORIGINS` to the Vercel URL, e.g.
`https://bda-energy.vercel.app` (comma-separate several; no trailing slash).

### 6.5 Free-plan limits
- The API sleeps after 15 minutes idle; the first request afterwards takes ~1 minute.
- The disk is ephemeral: files under `LOCAL_HDFS_ROOT` (uploaded datasets and
  job outputs) are lost on every restart or redeploy, while their metadata in
  MongoDB remains. Re-upload datasets after the service restarts.
- 512 MB RAM: keep uploads to a modest size.
