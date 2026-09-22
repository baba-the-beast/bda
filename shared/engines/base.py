"""
Abstract Base Classes for Analytical, Hive, and Stream Engines.
Defines unified contracts shared across both RENDER_LITE and FULL_BDA modes.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional, Tuple


class AnalyticsEngine(ABC):
    """Batch Analytics Engine interface for daily, hourly, monthly, and peak jobs."""

    @abstractmethod
    def run_job(
        self,
        job_type: str,
        input_path: str,
        output_path: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, str]:
        """Execute a batch analytical processing job."""
        pass


class HiveEngine(ABC):
    """Hive Analytical Query Engine interface."""

    @abstractmethod
    def execute_query(
        self,
        template_name: str,
        dataset_csv_path: str,
        parameters: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[Dict[str, Any]], float]:
        """Execute an analytical query template and return (records, duration_seconds)."""
        pass


class StreamEngine(ABC):
    """Real-Time Stream and Window Aggregation Engine interface."""

    @abstractmethod
    def start_stream(
        self,
        dataset_id: str,
        events_per_sec: int = 5,
        speed_multiplier: float = 1.0,
        repeat_mode: bool = True,
    ) -> None:
        """Start stream processing/simulation."""
        pass

    @abstractmethod
    def pause(self) -> None:
        """Pause the active stream."""
        pass

    @abstractmethod
    def resume(self) -> None:
        """Resume the paused stream."""
        pass

    @abstractmethod
    def stop(self) -> None:
        """Stop the stream."""
        pass

    @abstractmethod
    def get_status(self) -> Dict[str, Any]:
        """Get stream runtime telemetry status."""
        pass
