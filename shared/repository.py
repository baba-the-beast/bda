"""
Data access repository implementing complete CRUD, aggregations,
and analytical queries for all platform models.
Integrates with MongoDB with an internal thread-safe fallback cache for testing.
Enforces fail-closed semantics in DATA_STORE_MODE=mongodb.
"""

from datetime import datetime, timezone
import os
import threading
from typing import Any, Dict, List, Optional
from pymongo import ReplaceOne, UpdateOne

from shared.database import get_database as _raw_get_database
from shared.errors import DatabaseConnectionException
from shared.models import (
    DailyAggregate, HourlyAggregate, MonthlyAggregate, PeakEvent, StreamWindow,
    DatasetMetadata, AnalyticsJobResponse, AuditLogEntry, SecurityEventEntry,
    UserResponse, JobStatus, DatasetStatus, SessionRecord
)

# In-memory thread-safe fallback repository store (Active ONLY in DATA_STORE_MODE=memory)
_lock = threading.RLock()
_local_store: Dict[str, Dict[str, Any]] = {
    "users": {},
    "sessions": {},
    "workspaces": {},
    "datasets": {},
    "analytics_jobs": {},
    "daily_aggregates": {},
    "hourly_aggregates": {},
    "monthly_aggregates": {},
    "peak_events": {},
    "stream_windows": {},
    "audit_logs": {},
    "security_events": {},
}

_indexes_ensured = False


def ensure_indexes(db) -> None:
    """Create essential compound and unique indexes for high-performance query execution."""
    try:
        db.users.create_index("email", unique=True)
        db.datasets.create_index([("id", 1), ("workspace_id", 1)])
        db.daily_aggregates.create_index([("dataset_id", 1), ("date", 1)], unique=True)
        db.hourly_aggregates.create_index([("dataset_id", 1), ("hour", 1)], unique=True)
        db.monthly_aggregates.create_index([("dataset_id", 1), ("year", 1), ("month", 1)], unique=True)
        db.peak_events.create_index([("dataset_id", 1), ("timestamp", -1)])
        db.stream_windows.create_index([("dataset_id", 1), ("window_end", -1)])
        db.user_sessions.create_index("jti", unique=True)
        db.user_sessions.create_index([("user_id", 1), ("is_revoked", 1)])
        db.audit_logs.create_index([("workspace_id", 1), ("timestamp", -1)])
    except Exception:
        pass


def _get_active_db():
    """
    Resolves the active database handle based on DATA_STORE_MODE.
    Fails closed with DatabaseConnectionException if MongoDB is unreachable in mongodb mode.
    """
    global _indexes_ensured
    mode = os.getenv("DATA_STORE_MODE", "mongodb").lower()
    if mode == "memory":
        return None

    db = _raw_get_database()
    if db is None:
        raise DatabaseConnectionException(
            "CRITICAL DATASTORE ERROR: Failed to connect to MongoDB cluster while DATA_STORE_MODE=mongodb. "
            "Silent fallback to in-memory store is disabled in production. Set DATA_STORE_MODE=memory only for isolated testing."
        )
    if not _indexes_ensured:
        ensure_indexes(db)
        _indexes_ensured = True
    return db


class Repository:
    # -------------------------------------------------------------------------
    # Users
    # -------------------------------------------------------------------------
    @staticmethod
    def save_user(user_doc: Dict[str, Any]) -> None:
        db = _get_active_db()
        if db is not None:
            db.users.replace_one({"email": user_doc["email"]}, user_doc, upsert=True)
        with _lock:
            _local_store["users"][user_doc["email"]] = user_doc

    @staticmethod
    def get_user_by_email(email: str) -> Optional[Dict[str, Any]]:
        db = _get_active_db()
        if db is not None:
            doc = db.users.find_one({"email": email})
            if doc:
                doc.pop("_id", None)
                return doc
        with _lock:
            return _local_store["users"].get(email)

    @staticmethod
    def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
        db = _get_active_db()
        if db is not None:
            doc = db.users.find_one({"id": user_id})
            if doc:
                doc.pop("_id", None)
                return doc
        with _lock:
            for u in _local_store["users"].values():
                if u.get("id") == user_id:
                    return u
        return None

    @staticmethod
    def list_users(workspace_id: Optional[str] = None) -> List[Dict[str, Any]]:
        db = _get_active_db()
        if db is not None:
            query = {"workspace_id": workspace_id} if workspace_id else {}
            cursor = db.users.find(query)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(doc)
            return results
        with _lock:
            users = list(_local_store["users"].values())
            if workspace_id:
                return [u for u in users if u.get("workspace_id") == workspace_id]
            return users

    # -------------------------------------------------------------------------
    # Refresh Token Sessions
    # -------------------------------------------------------------------------
    @staticmethod
    def save_session(session_doc: Dict[str, Any]) -> None:
        db = _get_active_db()
        if db is not None:
            db.user_sessions.replace_one({"jti": session_doc["jti"]}, session_doc, upsert=True)
        with _lock:
            _local_store["sessions"][session_doc["jti"]] = session_doc

    @staticmethod
    def get_session(jti: str) -> Optional[Dict[str, Any]]:
        db = _get_active_db()
        if db is not None:
            doc = db.user_sessions.find_one({"jti": jti})
            if doc:
                doc.pop("_id", None)
                return doc
        with _lock:
            return _local_store["sessions"].get(jti)
        return None

    @staticmethod
    def revoke_session(jti: str) -> bool:
        db = _get_active_db()
        if db is not None:
            res = db.user_sessions.update_one({"jti": jti}, {"$set": {"is_revoked": True}})
            return res.modified_count > 0
        with _lock:
            sess = _local_store["sessions"].get(jti)
            if sess:
                sess["is_revoked"] = True
                return True
        return False

    @staticmethod
    def revoke_all_user_sessions(user_id: str) -> int:
        db = _get_active_db()
        if db is not None:
            res = db.user_sessions.update_many({"user_id": user_id}, {"$set": {"is_revoked": True}})
            return res.modified_count
        with _lock:
            count = 0
            for s in _local_store["sessions"].values():
                if s.get("user_id") == user_id:
                    s["is_revoked"] = True
                    count += 1
            return count

    # -------------------------------------------------------------------------
    # Datasets
    # -------------------------------------------------------------------------
    @staticmethod
    def save_dataset(dataset: DatasetMetadata) -> None:
        doc = dataset.model_dump(mode="json")
        db = _get_active_db()
        if db is not None:
            db.datasets.replace_one({"id": dataset.id}, doc, upsert=True)
        with _lock:
            _local_store["datasets"][dataset.id] = doc

    @staticmethod
    def get_dataset(dataset_id: str) -> Optional[DatasetMetadata]:
        db = _get_active_db()
        if db is not None:
            doc = db.datasets.find_one({"id": dataset_id})
            if doc:
                doc.pop("_id", None)
                return DatasetMetadata(**doc)
        with _lock:
            doc = _local_store["datasets"].get(dataset_id)
            return DatasetMetadata(**doc) if doc else None

    @staticmethod
    def list_datasets(workspace_id: Optional[str] = None) -> List[DatasetMetadata]:
        db = _get_active_db()
        if db is not None:
            query = {"workspace_id": workspace_id} if workspace_id else {}
            cursor = db.datasets.find(query).sort("created_at", -1)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(DatasetMetadata(**doc))
            return results
        with _lock:
            items = list(_local_store["datasets"].values())
            if workspace_id:
                items = [i for i in items if i.get("workspace_id") == workspace_id]
            return [DatasetMetadata(**d) for d in items]

    @staticmethod
    def delete_dataset(dataset_id: str) -> bool:
        db = _get_active_db()
        if db is not None:
            db.datasets.delete_one({"id": dataset_id})
        with _lock:
            if dataset_id in _local_store["datasets"]:
                del _local_store["datasets"][dataset_id]
                return True
        return False

    # -------------------------------------------------------------------------
    # Analytics Jobs
    # -------------------------------------------------------------------------
    @staticmethod
    def save_job(job: AnalyticsJobResponse) -> None:
        doc = job.model_dump(mode="json")
        db = _get_active_db()
        if db is not None:
            db.analytics_jobs.replace_one({"id": job.id}, doc, upsert=True)
        with _lock:
            _local_store["analytics_jobs"][job.id] = doc

    @staticmethod
    def get_job(job_id: str) -> Optional[AnalyticsJobResponse]:
        db = _get_active_db()
        if db is not None:
            doc = db.analytics_jobs.find_one({"id": job_id})
            if doc:
                doc.pop("_id", None)
                return AnalyticsJobResponse(**doc)
        with _lock:
            doc = _local_store["analytics_jobs"].get(job_id)
            return AnalyticsJobResponse(**doc) if doc else None

    @staticmethod
    def list_jobs(dataset_id: Optional[str] = None, workspace_id: Optional[str] = None) -> List[AnalyticsJobResponse]:
        db = _get_active_db()
        if db is not None:
            query = {}
            if dataset_id:
                query["dataset_id"] = dataset_id
            if workspace_id:
                query["workspace_id"] = workspace_id
            cursor = db.analytics_jobs.find(query).sort("created_at", -1)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(AnalyticsJobResponse(**doc))
            return results
        with _lock:
            items = list(_local_store["analytics_jobs"].values())
            if dataset_id:
                items = [i for i in items if i.get("dataset_id") == dataset_id]
            if workspace_id:
                items = [i for i in items if i.get("workspace_id") == workspace_id]
            return [AnalyticsJobResponse(**d) for d in items]

    # -------------------------------------------------------------------------
    # Analytical Aggregates Persistence
    # -------------------------------------------------------------------------
    @staticmethod
    def save_daily_aggregates(aggregates: List[DailyAggregate]) -> None:
        if not aggregates:
            return
        db = _get_active_db()
        docs = [a.model_dump(mode="json") for a in aggregates]
        if db is not None:
            ops = [
                UpdateOne({"dataset_id": d["dataset_id"], "date": d["date"]}, {"$set": d}, upsert=True)
                for d in docs
            ]
            db.daily_aggregates.bulk_write(ops, ordered=False)
        with _lock:
            for d in docs:
                key = f"{d['dataset_id']}_{d['date']}"
                _local_store["daily_aggregates"][key] = d

    @staticmethod
    def get_daily_aggregates(dataset_id: str, limit: Optional[int] = None) -> List[DailyAggregate]:
        db = _get_active_db()
        if db is not None:
            cursor = db.daily_aggregates.find({"dataset_id": dataset_id}).sort("date", 1)
            if limit is not None:
                cursor = cursor.limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(DailyAggregate(**doc))
            return results
        with _lock:
            matches = [v for v in _local_store["daily_aggregates"].values() if v.get("dataset_id") == dataset_id]
            matches.sort(key=lambda x: x.get("date", ""))
            if limit is not None:
                matches = matches[:limit]
            return [DailyAggregate(**d) for d in matches]

    @staticmethod
    def save_hourly_aggregates(aggregates: List[HourlyAggregate]) -> None:
        if not aggregates:
            return
        db = _get_active_db()
        docs = [a.model_dump(mode="json") for a in aggregates]
        if db is not None:
            ops = [
                UpdateOne({"dataset_id": d["dataset_id"], "hour": d["hour"]}, {"$set": d}, upsert=True)
                for d in docs
            ]
            db.hourly_aggregates.bulk_write(ops, ordered=False)
        with _lock:
            for d in docs:
                key = f"{d['dataset_id']}_{d['hour']}"
                _local_store["hourly_aggregates"][key] = d

    @staticmethod
    def get_hourly_aggregates(dataset_id: str) -> List[HourlyAggregate]:
        db = _get_active_db()
        if db is not None:
            cursor = db.hourly_aggregates.find({"dataset_id": dataset_id}).sort("hour", 1)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(HourlyAggregate(**doc))
            return results
        with _lock:
            matches = [v for v in _local_store["hourly_aggregates"].values() if v.get("dataset_id") == dataset_id]
            matches.sort(key=lambda x: x.get("hour", 0))
            return [HourlyAggregate(**d) for d in matches]

    @staticmethod
    def save_monthly_aggregates(aggregates: List[MonthlyAggregate]) -> None:
        if not aggregates:
            return
        db = _get_active_db()
        docs = [a.model_dump(mode="json") for a in aggregates]
        if db is not None:
            ops = [
                UpdateOne(
                    {"dataset_id": d["dataset_id"], "year": d["year"], "month": d["month"]},
                    {"$set": d},
                    upsert=True,
                )
                for d in docs
            ]
            db.monthly_aggregates.bulk_write(ops, ordered=False)
        with _lock:
            for d in docs:
                key = f"{d['dataset_id']}_{d['year']}_{d['month']}"
                _local_store["monthly_aggregates"][key] = d

    @staticmethod
    def get_monthly_aggregates(dataset_id: str) -> List[MonthlyAggregate]:
        db = _get_active_db()
        if db is not None:
            cursor = db.monthly_aggregates.find({"dataset_id": dataset_id}).sort([("year", 1), ("month", 1)])
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(MonthlyAggregate(**doc))
            return results
        with _lock:
            matches = [v for v in _local_store["monthly_aggregates"].values() if v.get("dataset_id") == dataset_id]
            matches.sort(key=lambda x: (x.get("year", 0), x.get("month", 0)))
            return [MonthlyAggregate(**d) for d in matches]

    @staticmethod
    def save_peak_events(events: List[PeakEvent]) -> None:
        if not events:
            return
        db = _get_active_db()
        docs = [e.model_dump(mode="json") for e in events]
        if db is not None:
            ops = [
                UpdateOne(
                    {"dataset_id": d["dataset_id"], "timestamp": d["timestamp"]},
                    {"$set": d},
                    upsert=True,
                )
                for d in docs
            ]
            db.peak_events.bulk_write(ops, ordered=False)
        with _lock:
            for d in docs:
                key = f"{d['dataset_id']}_{d['timestamp']}"
                _local_store["peak_events"][key] = d

    @staticmethod
    def get_peak_events(dataset_id: str, limit: int = 50) -> List[PeakEvent]:
        db = _get_active_db()
        if db is not None:
            cursor = db.peak_events.find({"dataset_id": dataset_id}).sort("power", -1).limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(PeakEvent(**doc))
            return results
        with _lock:
            matches = [v for v in _local_store["peak_events"].values() if v.get("dataset_id") == dataset_id]
            matches.sort(key=lambda x: x.get("power", 0.0), reverse=True)
            return [PeakEvent(**d) for d in matches[:limit]]

    # -------------------------------------------------------------------------
    # Stream Windows
    # -------------------------------------------------------------------------
    @staticmethod
    def save_stream_window(window: StreamWindow) -> None:
        doc = window.model_dump(mode="json")
        db = _get_active_db()
        if db is not None:
            db.stream_windows.update_one(
                {"dataset_id": window.dataset_id, "window_start": doc["window_start"]},
                {"$set": doc},
                upsert=True
            )
        with _lock:
            key = f"{window.dataset_id}_{doc['window_start']}"
            _local_store["stream_windows"][key] = doc

    @staticmethod
    def get_recent_stream_windows(dataset_id: str, limit: int = 30) -> List[StreamWindow]:
        db = _get_active_db()
        if db is not None:
            cursor = db.stream_windows.find({"dataset_id": dataset_id}).sort("window_start", -1).limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(StreamWindow(**doc))
            return list(reversed(results))
        with _lock:
            matches = [v for v in _local_store["stream_windows"].values() if v.get("dataset_id") == dataset_id]
            matches.sort(key=lambda x: x.get("window_start", ""), reverse=True)
            return [StreamWindow(**d) for d in reversed(matches[:limit])]

    # -------------------------------------------------------------------------
    # Audit & Security Logging
    # -------------------------------------------------------------------------
    @staticmethod
    def log_audit_event(entry: AuditLogEntry) -> None:
        doc = entry.model_dump(mode="json")
        db = _get_active_db()
        if db is not None:
            db.audit_logs.insert_one(doc)
        with _lock:
            _local_store["audit_logs"][entry.id] = doc

    @staticmethod
    def list_audit_logs(limit: int = 100, workspace_id: Optional[str] = None) -> List[AuditLogEntry]:
        db = _get_active_db()
        query = {"workspace_id": workspace_id} if workspace_id else {}
        if db is not None:
            cursor = db.audit_logs.find(query).sort("timestamp", -1).limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(AuditLogEntry(**doc))
            return results
        with _lock:
            logs = list(_local_store["audit_logs"].values())
            if workspace_id:
                logs = [l for l in logs if l.get("workspace_id") == workspace_id]
            logs.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return [AuditLogEntry(**d) for d in logs[:limit]]

    @staticmethod
    def log_security_event(entry: SecurityEventEntry) -> None:
        doc = entry.model_dump(mode="json")
        db = _get_active_db()
        if db is not None:
            db.security_events.insert_one(doc)
        with _lock:
            _local_store["security_events"][entry.id] = doc

    @staticmethod
    def list_security_events(limit: int = 100) -> List[SecurityEventEntry]:
        db = _get_active_db()
        if db is not None:
            cursor = db.security_events.find().sort("timestamp", -1).limit(limit)
            results = []
            for doc in cursor:
                doc.pop("_id", None)
                results.append(SecurityEventEntry(**doc))
            return results
        with _lock:
            events = list(_local_store["security_events"].values())
            events.sort(key=lambda x: x.get("timestamp", ""), reverse=True)
            return [SecurityEventEntry(**d) for d in events[:limit]]
