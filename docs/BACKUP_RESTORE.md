# Backup, Disaster Recovery & Data Retention Guide

## 1. Backup Strategy & Objectives

The platform maintains two distinct persistence tiers requiring tailored backup paradigms:
1. **HDFS Distributed Storage**: Stores raw input archives, cleaned TSV datasets, and MapReduce part files.
2. **MongoDB Metadata & Read-Models**: Stores user credentials, job run metadata, pre-computed analytical aggregates, and audit logs.

### Recovery Objectives:
- **Recovery Point Objective (RPO)**:
  - Raw Telemetry (HDFS): $0 \text{ minutes}$ (write-once immutable data).
  - MongoDB Read-Models: $< 1 \text{ hour}$ (can be deterministically regenerated from HDFS).
  - User & Audit Logs: $< 5 \text{ minutes}$.
- **Recovery Time Objective (RTO)**:
  - Critical Ingress & APIs: $< 15 \text{ minutes}$.
  - Complete Recompute of Multi-Year Historical Analytics: $< 2 \text{ hours}$.

---

## 2. HDFS Backup & Snapshot Procedures

### 2.1 HDFS Directory Snapshots
HDFS provides zero-copy read-only snapshots of the dataset directories:

```bash
# Allow snapshots on the energy storage tree
hdfs dfsadmin -allowSnapshot /user/bda/energy

# Create a daily timestamped snapshot
hdfs dfs -createSnapshot /user/bda/energy snapshot_$(date +%Y%m%d)

# List active snapshots
hdfs dfs -ls /user/bda/energy/.snapshot
```

### 2.2 Remote Disaster Recovery via DistCp
To synchronize HDFS data to a disaster recovery cluster or cloud object store (e.g. AWS S3 or Google Cloud Storage):

```bash
hadoop distcp \
  -update \
  -delete \
  hdfs://namenode:9000/user/bda/energy/ \
  s3a://bda-energy-dr-backups/user/bda/energy/
```

---

## 3. MongoDB Backup & Restoration

### 3.1 Logical Backup with `mongodump`
Automated Kubernetes CronJobs perform daily compressed binary dumps:

```bash
# Execute compressed mongodump
mongodump \
  --uri="mongodb://bda_user:bda_password@mongodb:27017/bda_energy?authSource=bda_energy" \
  --gzip \
  --archive=/backups/bda_energy_$(date +%Y%m%d_%H%M%S).archive.gz
```

### 3.2 Restoration Procedure with `mongorestore`
```bash
# Drop current collections and restore from backup archive
mongorestore \
  --uri="mongodb://bda_user:bda_password@mongodb:27017/bda_energy?authSource=bda_energy" \
  --gzip \
  --drop \
  --archive=/backups/bda_energy_20260918_080000.archive.gz
```

---

## 4. Disaster Recovery & Reconstruction Drill

In the event of total catastrophic loss of the MongoDB cluster:
1. Provision a fresh MongoDB 7.0 cluster and execute `data-platform/init-mongo.js` to create roles and compound indexes.
2. If database backups are damaged, invoke the platform's deterministic recompute engine:
   ```bash
   # 1. Re-preprocess raw datasets from HDFS
   energy dataset preprocess <dataset_id>
   
   # 2. Re-run all MapReduce batch aggregators
   energy mapreduce run <dataset_id> --job daily
   energy mapreduce run <dataset_id> --job hourly
   energy mapreduce run <dataset_id> --job monthly
   energy mapreduce run <dataset_id> --job peak
   ```
3. All MongoDB collections (`daily_aggregates`, `hourly_aggregates`, etc.) are fully reconstructed with mathematical parity.

---

## 5. Retention Policies

| Data Tier | Retention Period | Storage Class | Lifecycle Action |
| :--- | :--- | :--- | :--- |
| **Raw Datasets (`/raw`)** | 7 Years | Cold / Immutable HDFS | Archived to Glacier/Tape after 1 year |
| **Cleaned Datasets (`/cleaned`)** | 3 Years | Warm HDFS | Re-creatable from `/raw` |
| **Rejected Records (`/rejected`)** | 90 Days | Ephemeral HDFS | Auto-purged after quality audit |
| **MapReduce Part Files (`/output`)** | 30 Days | Scratch HDFS | Purged after sink to MongoDB |
| **Real-Time Stream Windows** | 48 Hours | MongoDB TTL Index | Expired automatically via TTL |
| **Audit Logs (`audit_logs`)** | 5 Years | MongoDB / WORM Log Sink | Immutable compliance archive |
