"""
High-Fidelity Real-Time Stream Simulator and Window Aggregation Broadcaster.
Replays authentic historical smart-meter readings, computes sliding window telemetry,
and broadcasts events to subscribed SSE / WebSocket clients.
"""

from collections import deque
from datetime import datetime, timezone
import json
import os
import queue
import sys
import threading
import time
from typing import Any, Dict, List, Optional

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.hdfs import get_hdfs_client
from shared.logger import get_logger
from shared.models import StreamWindow
from shared.repository import Repository

logger = get_logger("stream-simulator")
hdfs_client = get_hdfs_client()


class StreamSimulator:
    def __init__(self):
        self.is_running = False
        self.is_paused = False
        self.dataset_id: Optional[str] = None
        self.speed_multiplier: float = 1.0
        self.events_per_second: int = 5
        self.repeat_mode: bool = True
        self.total_events_emitted: int = 0
        self.last_event: Optional[Dict[str, Any]] = None

        self._thread: Optional[threading.Thread] = None
        self._subscribers: List[queue.Queue] = []
        self._sub_lock = threading.Lock()
        self._window_buffer = deque(maxlen=300)  # rolling window of 300 readings

    def register_subscriber(self) -> queue.Queue:
        q = queue.Queue(maxsize=100)
        with self._sub_lock:
            self._subscribers.append(q)
        return q

    def unregister_subscriber(self, q: queue.Queue):
        with self._sub_lock:
            if q in self._subscribers:
                self._subscribers.remove(q)

    def _broadcast(self, data: Dict[str, Any]):
        with self._sub_lock:
            for q in list(self._subscribers):
                try:
                    q.put_nowait(data)
                except queue.Full:
                    pass

    def start(
        self,
        dataset_id: str,
        events_per_sec: int = 5,
        speed_multiplier: float = 1.0,
        repeat_mode: bool = True,
    ):
        if self.is_running:
            self.stop()

        self.dataset_id = dataset_id
        self.events_per_second = max(1, min(events_per_sec, 200))
        self.speed_multiplier = speed_multiplier
        self.repeat_mode = repeat_mode
        self.is_running = True
        self.is_paused = False
        self.total_events_emitted = 0

        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info(f"Stream simulator started for dataset {dataset_id} at {events_per_sec} events/sec")

    def pause(self):
        self.is_paused = True
        logger.info("Stream simulator paused")

    def resume(self):
        self.is_paused = False
        logger.info("Stream simulator resumed")

    def stop(self):
        self.is_running = False
        self.is_paused = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        logger.info("Stream simulator stopped")

    def get_status(self) -> Dict[str, Any]:
        return {
            "is_running": self.is_running,
            "is_paused": self.is_paused,
            "dataset_id": self.dataset_id,
            "events_per_second": self.events_per_second,
            "speed_multiplier": self.speed_multiplier,
            "total_events_emitted": self.total_events_emitted,
            "active_subscribers": len(self._subscribers),
            "last_event": self.last_event,
        }

    def _run_loop(self):
        ds = Repository.get_dataset(self.dataset_id)
        if not ds:
            self.is_running = False
            return

        cleaned_hdfs = ds.cleaned_hdfs_path or f"/user/bda/energy/cleaned/{self.dataset_id}/part-00000.csv"
        file_path = hdfs_client.get_local_path(cleaned_hdfs)

        if not os.path.exists(file_path):
            logger.error(f"Cannot stream dataset: cleaned file {file_path} does not exist")
            self.is_running = False
            return

        sleep_interval = 1.0 / float(self.events_per_second)

        while self.is_running:
            with open(file_path, "r", encoding="utf-8") as f:
                # Skip header
                header = f.readline()
                for line in f:
                    while self.is_paused and self.is_running:
                        time.sleep(0.2)

                    if not self.is_running:
                        break

                    line_str = line.strip()
                    if not line_str:
                        continue

                    parts = line_str.split(",")
                    if len(parts) < 8:
                        continue

                    try:
                        record = {
                            "timestamp": parts[0],
                            "global_active_power": float(parts[1]),
                            "global_reactive_power": float(parts[2]),
                            "voltage": float(parts[3]),
                            "global_intensity": float(parts[4]),
                            "sub_metering_1": float(parts[5]),
                            "sub_metering_2": float(parts[6]),
                            "sub_metering_3": float(parts[7]),
                            "dataset_id": self.dataset_id,
                            "simulated_at": datetime.now(timezone.utc).isoformat(),
                        }
                    except (ValueError, IndexError):
                        continue

                    self.total_events_emitted += 1
                    self.last_event = record
                    self._window_buffer.append(record)

                    # Compute rolling window metrics (1m tumbling & 5m sliding)
                    window_metric = self._calculate_window_metrics()
                    
                    # Persist aggregated window records at bounded intervals (e.g. once per 60 events or 30s)
                    # Defends MongoDB against high-frequency event flooding
                    current_time = time.time()
                    if window_metric and (current_time - getattr(self, "_last_db_persist_ts", 0.0) >= 15.0 or self.total_events_emitted % 60 == 0):
                        Repository.save_stream_window(window_metric)
                        self._last_db_persist_ts = current_time

                    window_dict = window_metric.model_dump(mode="json") if window_metric else None

                    # Dual-compatible SSE payload: supports both nested payload.reading and direct data.global_active_power
                    payload = {
                        "type": "TELEMETRY",
                        "reading": record,
                        **record,
                        "window": window_dict,
                        "total_emitted": self.total_events_emitted,
                    }

                    self._broadcast(payload)
                    time.sleep(sleep_interval)

            if not self.repeat_mode:
                break

        self.is_running = False

    def _calculate_window_metrics(self) -> Optional[StreamWindow]:
        if not self._window_buffer:
            return None

        recent = list(self._window_buffer)
        powers = [r["global_active_power"] for r in recent]
        sub_totals = [r["sub_metering_1"] + r["sub_metering_2"] + r["sub_metering_3"] for r in recent]

        # 5-minute sliding window (up to 300 readings)
        sliding_avg = sum(powers) / len(powers)
        min_p = min(powers)
        max_p = max(powers)

        # 1-minute tumbling window (last 60 readings)
        tumbling_slice = powers[-60:] if len(powers) >= 60 else powers
        tumbling_avg = sum(tumbling_slice) / len(tumbling_slice)

        # Trend calculation: compare first half average to second half
        trend = "STABLE"
        if len(powers) >= 10:
            mid = len(powers) // 2
            first_avg = sum(powers[:mid]) / mid
            second_avg = sum(powers[mid:]) / (len(powers) - mid)
            if second_avg > first_avg * 1.15:
                trend = "RISING"
            elif second_avg < first_avg * 0.85:
                trend = "FALLING"

        now = datetime.now(timezone.utc)
        return StreamWindow(
            dataset_id=self.dataset_id or "default",
            window_start=now,
            window_end=now,
            average_power=round(sliding_avg, 4),
            minimum_power=round(min_p, 4),
            maximum_power=round(max_p, 4),
            reading_count=len(recent),
            event_rate=float(self.events_per_second),
            sub_metering_total=round(sum(sub_totals) / len(sub_totals), 2),
            recent_trend=trend,
        )


simulator_instance = StreamSimulator()
