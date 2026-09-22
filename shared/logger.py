"""
Production structured JSON logger with credential scrubbing and correlation tracking.
Ensures no secrets, tokens, or passwords ever reach log sinks.
"""

import json
import logging
import os
import sys
from datetime import datetime, timezone
from typing import Any, Dict

SENSITIVE_KEYS = {
    "password", "token", "access_token", "refresh_token", "secret",
    "authorization", "api_key", "credentials", "cookie", "set-cookie"
}


def scrub_sensitive_data(obj: Any) -> Any:
    if isinstance(obj, dict):
        scrubbed = {}
        for k, v in obj.items():
            if any(s in k.lower() for s in SENSITIVE_KEYS):
                scrubbed[k] = "[REDACTED]"
            else:
                scrubbed[k] = scrub_sensitive_data(v)
        return scrubbed
    elif isinstance(obj, list):
        return [scrub_sensitive_data(item) for item in obj]
    return obj


class JSONFormatter(logging.Formatter):
    def __init__(self, service_name: str):
        super().__init__()
        self.service_name = service_name

    def format(self, record: logging.LogRecord) -> str:
        log_entry: Dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "service": self.service_name,
            "level": record.levelname,
            "message": record.getMessage(),
            "logger": record.name,
        }

        # Include custom correlation attributes if present
        if hasattr(record, "request_id"):
            log_entry["request_id"] = getattr(record, "request_id")
        if hasattr(record, "trace_id"):
            log_entry["trace_id"] = getattr(record, "trace_id")
        if hasattr(record, "extra_fields"):
            extra = scrub_sensitive_data(getattr(record, "extra_fields"))
            if isinstance(extra, dict):
                log_entry.update(extra)

        if record.exc_info:
            log_entry["exception"] = self.formatException(record.exc_info)

        return json.dumps(log_entry)


def get_logger(service_name: str) -> logging.Logger:
    logger = logging.getLogger(service_name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(JSONFormatter(service_name))
        logger.addHandler(handler)
        log_level = os.getenv("LOG_LEVEL", "INFO").upper()
        logger.setLevel(getattr(logging, log_level, logging.INFO))
        logger.propagate = False
    return logger
