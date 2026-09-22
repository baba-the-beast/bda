"""
Event contracts for asynchronous distributed communication between services.
Adheres to CloudEvents-compatible specification with correlation IDs and schema versioning.
"""

from datetime import datetime, timezone
import uuid
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field


class BaseEvent(BaseModel):
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    event_type: str
    event_version: str = "1.0.0"
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    producer: str
    correlation_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    payload: Dict[str, Any] = Field(default_factory=dict)


class DatasetUploadedEvent(BaseEvent):
    event_type: str = "DatasetUploaded"


class PreprocessingStartedEvent(BaseEvent):
    event_type: str = "PreprocessingStarted"


class PreprocessingCompletedEvent(BaseEvent):
    event_type: str = "PreprocessingCompleted"


class AnalyticsJobSubmittedEvent(BaseEvent):
    event_type: str = "AnalyticsJobSubmitted"


class AnalyticsJobCompletedEvent(BaseEvent):
    event_type: str = "AnalyticsJobCompleted"


class AnalyticsJobFailedEvent(BaseEvent):
    event_type: str = "AnalyticsJobFailed"


class StreamingStartedEvent(BaseEvent):
    event_type: str = "StreamingStarted"


class StreamingStoppedEvent(BaseEvent):
    event_type: str = "StreamingStopped"


class EnergyReadingEvent(BaseModel):
    """Event emitted by the Stream Simulator representing a single smart meter observation."""
    event_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: str  # ISO 8601
    global_active_power: float
    global_reactive_power: float
    voltage: float
    global_intensity: float
    sub_metering_1: float
    sub_metering_2: float
    sub_metering_3: float
    dataset_id: str
