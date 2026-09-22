"""
MongoDB database connection lifecycle manager.
Features connection pooling, timeouts, exponential backoff retries,
and graceful connection teardown.
"""

import os
import time
from typing import Optional
from pymongo import MongoClient
from pymongo.errors import ConnectionFailure, ServerSelectionTimeoutError

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://bda_app:bda_secure_pass_2026@localhost:27017/bda_energy?authSource=admin"
)
DATABASE_NAME = os.getenv("MONGO_DB_NAME", "bda_energy")

_client: Optional[MongoClient] = None


def get_mongo_client(max_retries: int = 2, retry_delay: float = 0.5) -> Optional[MongoClient]:
    global _client
    if _client is not None:
        try:
            _client.admin.command('ping')
            return _client
        except (ConnectionFailure, ServerSelectionTimeoutError):
            _client = None

    for attempt in range(max_retries):
        try:
            client = MongoClient(
                MONGO_URI,
                serverSelectionTimeoutMS=2000,
                connectTimeoutMS=2000,
                maxPoolSize=50,
                minPoolSize=5,
                retryWrites=True,
            )
            client.admin.command('ping')
            _client = client
            return _client
        except Exception:
            if attempt < max_retries - 1:
                time.sleep(retry_delay * (2 ** attempt))

    return None


def get_database():
    client = get_mongo_client()
    if client:
        return client[DATABASE_NAME]
    return None


def close_mongo_connection():
    global _client
    if _client:
        _client.close()
        _client = None
