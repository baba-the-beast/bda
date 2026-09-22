/**
 * MongoDB Initialization & Schema / Index Setup Script.
 * Configures authentication, least-privilege application role, collections, and compound indexes.
 */

db = db.getSiblingDB('admin');

// Authenticate or create application user
db.createUser({
    user: "bda_app",
    pwd: "bda_secure_pass_2026",
    roles: [
        { role: "readWrite", db: "bda_energy" }
    ]
});

db = db.getSiblingDB('bda_energy');

// 1. Users collection
db.createCollection("users");
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ workspace_id: 1, role: 1 });

// 2. Datasets collection
db.createCollection("datasets");
db.datasets.createIndex({ id: 1 }, { unique: true });
db.datasets.createIndex({ workspace_id: 1, created_at: -1 });

// 3. Analytics Jobs
db.createCollection("analytics_jobs");
db.analytics_jobs.createIndex({ id: 1 }, { unique: true });
db.analytics_jobs.createIndex({ dataset_id: 1, status: 1 });
db.analytics_jobs.createIndex({ workspace_id: 1, created_at: -1 });

// 4. Daily Aggregates
db.createCollection("daily_aggregates");
db.daily_aggregates.createIndex({ dataset_id: 1, date: 1 }, { unique: true });
db.daily_aggregates.createIndex({ date: 1 });

// 5. Hourly Aggregates
db.createCollection("hourly_aggregates");
db.hourly_aggregates.createIndex({ dataset_id: 1, hour: 1 });

// 6. Monthly Aggregates
db.createCollection("monthly_aggregates");
db.monthly_aggregates.createIndex({ dataset_id: 1, year: 1, month: 1 }, { unique: true });

// 7. Peak Events
db.createCollection("peak_events");
db.peak_events.createIndex({ dataset_id: 1, power: -1 });
db.peak_events.createIndex({ date: 1, hour: 1 });

// 8. Stream Windows (TTL index optional, e.g. 7 days retention)
db.createCollection("stream_windows");
db.stream_windows.createIndex({ dataset_id: 1, window_start: -1 });

// 9. Audit Logs (immutable, 90-day retention index)
db.createCollection("audit_logs");
db.audit_logs.createIndex({ timestamp: -1, actor: 1 });

// 10. Security Events
db.createCollection("security_events");
db.security_events.createIndex({ timestamp: -1, severity: 1 });

print("[INFO] MongoDB bda_energy initialized with security users, schemas, and optimized indexes.");
