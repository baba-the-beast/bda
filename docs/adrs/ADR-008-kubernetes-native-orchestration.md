# ADR-008: Kubernetes Native Orchestration and Zero-Trust Network Policies

## Status
Accepted

## Context
Deploying 8 microservices, stateful data tiers, and monitoring agents into production requires automated scheduling, self-healing, horizontal scaling, and strict defense against lateral network movement by compromised pods.

## Decision
1. Package all platform microservices and stateful stores as native Kubernetes manifests (`infrastructure/kubernetes/base/`):
   - `StatefulSet` for MongoDB and Redis with PersistentVolumeClaims.
   - `Deployment` for stateless microservices with `livenessProbe` and `readinessProbe`.
   - `HorizontalPodAutoscaler` (HPA) targeting 75% CPU and 80% memory.
   - `PodDisruptionBudget` (PDB) guaranteeing minimum replica availability during maintenance.
2. Implement **Zero-Trust NetworkPolicies** (`network-policy.yaml`):
   - Default deny ingress and egress across the `bda-energy` namespace.
   - Explicit ingress rules allowing traffic only from `api-gateway` to internal services, and services to MongoDB, Redis, and Kafka.
3. Package environment topologies via Helm chart (`infrastructure/helm/energy-platform/`).

## Consequences
- **Positive**: Enterprise-grade high availability, automatic pod recovery, and containment of security incidents.
- **Negative**: Requires Kubernetes runtime (k8s / Minikube / k3s) for full production deployment.
