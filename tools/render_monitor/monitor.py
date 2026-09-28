"""Render keep-alive monitor.

Periodically sends a GET to the deployed backend's health endpoint and logs
whether it is reachable. Standard library only, so it runs anywhere Python 3.11+
is available without installing the application's dependencies.

This process must run *outside* the Render service it watches: a service that
pings itself never sees the idle period end, and once Render spins it down the
pinger is asleep too. See tools/render_monitor/README.md.

    python tools/render_monitor/monitor.py            # run until SIGINT/SIGTERM
    python tools/render_monitor/monitor.py --once     # single check, exit 0/1
"""

from __future__ import annotations

import argparse
import http.client
import json
import logging
import os
import signal
import socket
import sys
import threading
import time
from collections.abc import Callable, Mapping
from dataclasses import dataclass
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib import error, parse, request

USER_AGENT = "bda-render-monitor/1.0"
DEFAULT_ENV_FILE = Path(__file__).with_name(".env")

logger = logging.getLogger("render_monitor")


class ConfigError(ValueError):
    """Raised when the monitor's environment configuration is invalid."""


# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Config:
    render_url: str
    health_path: str = "/health"
    ping_interval_minutes: float = 10.0
    request_timeout_seconds: float = 30.0
    max_retries: int = 2
    retry_backoff_seconds: float = 2.0
    stats_every: int = 6
    status_port: int | None = None
    status_host: str = "127.0.0.1"
    log_format: str = "text"

    @property
    def target_url(self) -> str:
        return self.render_url + self.health_path

    @property
    def host(self) -> str:
        return parse.urlsplit(self.render_url).hostname or ""


def _number(env: Mapping[str, str], key: str, default: float, *, minimum: float, maximum: float) -> float:
    raw = env.get(key, "").strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        raise ConfigError(f"{key} must be a number, got {raw!r}") from None
    if not minimum <= value <= maximum:
        raise ConfigError(f"{key} must be between {minimum:g} and {maximum:g}, got {value:g}")
    return value


def normalize_url(raw: str) -> str:
    """Validate RENDER_URL and reduce it to scheme://host[:port][/base-path]."""
    raw = raw.strip()
    if not raw:
        raise ConfigError("RENDER_URL is required, e.g. RENDER_URL=https://your-app.onrender.com")
    try:
        parts = parse.urlsplit(raw)
        parts.port  # noqa: B018 - raises ValueError for a non-numeric or out-of-range port
    except ValueError:
        raise ConfigError("RENDER_URL is not a valid URL (check brackets and port)") from None
    if parts.scheme not in ("http", "https") or not parts.hostname:
        raise ConfigError("RENDER_URL must be an absolute http(s) URL, e.g. https://your-app.onrender.com")
    if parts.username or parts.password:
        # Credentials in the URL would end up in logs and in shell history.
        raise ConfigError("RENDER_URL must not contain credentials")
    if parts.query or parts.fragment:
        raise ConfigError("RENDER_URL must not contain a query string or fragment")
    if any(ch.isspace() for ch in raw):
        raise ConfigError("RENDER_URL must not contain whitespace")
    return f"{parts.scheme}://{parts.netloc}{parts.path.rstrip('/')}"


def load_config(env: Mapping[str, str]) -> Config:
    render_url = normalize_url(env.get("RENDER_URL", ""))

    health_path = env.get("HEALTH_PATH", "/health").strip() or "/health"
    if not health_path.startswith("/"):
        health_path = "/" + health_path
    if any(ch.isspace() or ord(ch) < 32 for ch in health_path) or "?" in health_path or "#" in health_path:
        raise ConfigError(f"HEALTH_PATH must be a plain path such as /health, got {health_path!r}")

    # Guard against the self-ping loop: Render sets RENDER_EXTERNAL_URL on its services.
    own_url = env.get("RENDER_EXTERNAL_URL", "").strip()
    if own_url and parse.urlsplit(own_url).hostname == parse.urlsplit(render_url).hostname:
        raise ConfigError(
            "RENDER_URL points at the Render service this monitor is running inside. "
            "Run the monitor from an independent machine instead (see README)."
        )

    status_port_raw = env.get("STATUS_PORT", "").strip()
    status_port = None
    if status_port_raw:
        status_port = int(_number(env, "STATUS_PORT", 0, minimum=1, maximum=65535))

    log_format = env.get("LOG_FORMAT", "text").strip().lower() or "text"
    if log_format not in ("text", "json"):
        raise ConfigError(f"LOG_FORMAT must be 'text' or 'json', got {log_format!r}")

    return Config(
        render_url=render_url,
        health_path=health_path,
        ping_interval_minutes=_number(env, "PING_INTERVAL_MINUTES", 10.0, minimum=1, maximum=24 * 60),
        request_timeout_seconds=_number(env, "REQUEST_TIMEOUT_SECONDS", 30.0, minimum=1, maximum=300),
        max_retries=int(_number(env, "MAX_RETRIES", 2, minimum=0, maximum=5)),
        retry_backoff_seconds=_number(env, "RETRY_BACKOFF_SECONDS", 2.0, minimum=0, maximum=300),
        stats_every=int(_number(env, "STATS_EVERY_N_CHECKS", 6, minimum=0, maximum=10_000)),
        status_port=status_port,
        status_host=env.get("STATUS_HOST", "127.0.0.1").strip() or "127.0.0.1",
        log_format=log_format,
    )


def read_env_file(path: Path) -> dict[str, str]:
    """Parse a simple KEY=VALUE .env file. Missing file -> empty dict; unreadable -> ConfigError."""
    values: dict[str, str] = {}
    try:
        # utf-8-sig also accepts the BOM that PowerShell's Out-File writes.
        lines = path.read_text(encoding="utf-8-sig").splitlines()
    except FileNotFoundError:
        return values
    except UnicodeDecodeError:
        raise ConfigError(f"env file {path} is not UTF-8 text (re-save it as UTF-8)") from None
    except OSError as exc:
        raise ConfigError(f"cannot read env file {path}: {exc.strerror or exc.__class__.__name__}") from None
    for line in lines:
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip().removeprefix("export ").strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "'\"":
            value = value[1:-1]
        values[key] = value
    return values


# --------------------------------------------------------------------------- #
# HTTP probe
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class Probe:
    """Outcome of a single HTTP attempt."""

    status: int | None
    elapsed_ms: float
    error: str | None

    @property
    def ok(self) -> bool:
        return self.error is None and self.status is not None and 200 <= self.status < 300

    @property
    def retryable(self) -> bool:
        # Network errors, timeouts, 5xx and 429 may clear up; other 4xx mean misconfiguration.
        return self.status is None or self.status >= 500 or self.status == 429


def http_get(url: str, timeout: float) -> Probe:
    """GET url once. Never raises for network or HTTP errors."""
    req = request.Request(url, method="GET", headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    started = time.perf_counter()

    def elapsed() -> float:
        return (time.perf_counter() - started) * 1000

    try:
        with request.urlopen(req, timeout=timeout) as resp:  # scheme validated in normalize_url
            resp.read(4096)
            return Probe(resp.status, elapsed(), None)
    except error.HTTPError as exc:
        exc.close()
        return Probe(exc.code, elapsed(), f"HTTP {exc.code}")
    except error.URLError as exc:
        if isinstance(exc.reason, TimeoutError | socket.timeout):
            return Probe(None, elapsed(), f"Connection timeout after {timeout:g}s")
        return Probe(None, elapsed(), f"Connection error: {exc.reason}")
    except TimeoutError:
        return Probe(None, elapsed(), f"Connection timeout after {timeout:g}s")
    except (OSError, http.client.HTTPException) as exc:
        return Probe(None, elapsed(), f"Connection error: {exc or exc.__class__.__name__}")
    except ValueError as exc:  # e.g. http.client.InvalidURL; must never kill the loop
        return Probe(None, elapsed(), f"Invalid request: {exc.__class__.__name__}")


# --------------------------------------------------------------------------- #
# Statistics
# --------------------------------------------------------------------------- #


def _now() -> datetime:
    return datetime.now(UTC)


class Stats:
    """Thread-safe running totals since the monitor started."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.started_at = _now()
        self.total = 0
        self.succeeded = 0
        self.failed = 0
        self.last_success: datetime | None = None
        self.last_failure: datetime | None = None
        self._response_ms_sum = 0.0

    def record(self, ok: bool, elapsed_ms: float) -> None:
        with self._lock:
            self.total += 1
            if ok:
                self.succeeded += 1
                self.last_success = _now()
                self._response_ms_sum += elapsed_ms
            else:
                self.failed += 1
                self.last_failure = _now()

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            return {
                "started_at": self.started_at.isoformat(timespec="seconds"),
                "total_checks": self.total,
                "successful_checks": self.succeeded,
                "failed_checks": self.failed,
                "last_success": self.last_success.isoformat(timespec="seconds") if self.last_success else None,
                "last_failure": self.last_failure.isoformat(timespec="seconds") if self.last_failure else None,
                # Averaged over successful checks: a timeout's duration says nothing about latency.
                "avg_response_ms": round(self._response_ms_sum / self.succeeded) if self.succeeded else None,
                "uptime_percent": round(100 * self.succeeded / self.total, 2) if self.total else None,
            }


# --------------------------------------------------------------------------- #
# Monitor
# --------------------------------------------------------------------------- #


@dataclass(frozen=True)
class CheckResult:
    ok: bool
    status: int | None
    elapsed_ms: float
    attempts: int
    error: str | None
    interrupted: bool = False


class Monitor:
    def __init__(
        self,
        config: Config,
        *,
        fetch: Callable[[str, float], Probe] = http_get,
        wait: Callable[[float], bool] | None = None,
    ) -> None:
        self.config = config
        self.stats = Stats()
        self._fetch = fetch
        self._stop = threading.Event()
        self._wait = wait or self._sleep

    @property
    def stopping(self) -> bool:
        return self._stop.is_set()

    def stop(self) -> None:
        self._stop.set()

    def _sleep(self, seconds: float) -> bool:
        """Wait up to `seconds`; True if stop was requested.

        Waits in short slices so the main thread regularly returns to the
        interpreter: on Windows a long Event.wait() can otherwise hold off a
        Ctrl+C handler until the whole interval has elapsed.
        """
        deadline = time.monotonic() + seconds
        while not self._stop.is_set():
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                return False
            self._stop.wait(min(remaining, 1.0))
        return True

    def backoff_delay(self, attempt: int) -> float:
        """Delay before retry number `attempt` (1-based): base, 2*base, 4*base, ..."""
        return self.config.retry_backoff_seconds * (2 ** (attempt - 1))

    def check_once(self) -> CheckResult:
        cfg = self.config
        attempts = 0
        probe = Probe(None, 0.0, "not attempted")
        while True:
            attempts += 1
            probe = self._fetch(cfg.target_url, cfg.request_timeout_seconds)
            if probe.ok or not probe.retryable or attempts > cfg.max_retries:
                break
            delay = self.backoff_delay(attempts)
            self._log(
                logging.WARNING,
                "attempt_failed",
                status=probe.status,
                response_ms=round(probe.elapsed_ms),
                attempt=attempts,
                error=probe.error,
                retry_in_s=delay,
            )
            if self._wait(delay) or self.stopping:
                # Shutdown, not an outage: leave the statistics untouched.
                self._log(logging.INFO, "interrupted", attempts=attempts)
                return CheckResult(False, probe.status, probe.elapsed_ms, attempts, probe.error, interrupted=True)

        result = CheckResult(probe.ok, probe.status, probe.elapsed_ms, attempts, probe.error)
        self.stats.record(result.ok, result.elapsed_ms)
        self._log(
            logging.INFO if result.ok else logging.ERROR,
            "ok" if result.ok else "FAILED",
            status=result.status,
            response_ms=round(result.elapsed_ms),
            attempts=result.attempts,
            error=result.error,
        )
        return result

    def run(self) -> None:
        cfg = self.config
        self._log(
            logging.INFO, "started", interval_min=cfg.ping_interval_minutes, timeout_s=cfg.request_timeout_seconds
        )
        if cfg.ping_interval_minutes >= 15:
            logger.warning(
                "PING_INTERVAL_MINUTES >= 15: Render's free tier idles services after about 15 minutes "
                "without traffic, so this interval will not keep the service awake."
            )
        interval_s = cfg.ping_interval_minutes * 60
        while not self.stopping:
            if self.check_once().interrupted:
                break
            if cfg.stats_every and self.stats.total % cfg.stats_every == 0:
                self.log_stats()
            if self._sleep(interval_s):
                break
        self.log_stats()
        self._log(logging.INFO, "stopped")

    def log_stats(self) -> None:
        self._log(logging.INFO, "stats", **self.stats.snapshot())

    def _log(self, level: int, event: str, **fields: object) -> None:
        record: dict[str, object] = {
            "timestamp": _now().isoformat(timespec="seconds"),
            "event": event,
            "url": self.config.render_url,
            "endpoint": self.config.health_path,
        }
        record.update({k: v for k, v in fields.items() if v is not None})
        if self.config.log_format == "json":
            logger.log(level, json.dumps(record))
            return
        ts = _now().strftime("%Y-%m-%d %H:%M:%S UTC")
        pairs = (
            f"{k}={json.dumps(v) if isinstance(v, str) and ' ' in v else v}"
            for k, v in record.items()
            if k not in ("timestamp", "event")
        )
        logger.log(level, f"[{ts}] health_check {event} {' '.join(pairs)}")


# --------------------------------------------------------------------------- #
# Optional local status endpoint
# --------------------------------------------------------------------------- #


def start_status_server(monitor: Monitor) -> ThreadingHTTPServer:
    """Serve GET /status with the running statistics. Binds STATUS_HOST (127.0.0.1 by default)."""

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            if self.path.rstrip("/") != "/status":
                self.send_error(404)
                return
            body = json.dumps({"target": monitor.config.target_url, **monitor.stats.snapshot()}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, format: str, *args: object) -> None:
            pass  # keep monitor logs to one line per check

    server = ThreadingHTTPServer((monitor.config.status_host, monitor.config.status_port or 0), Handler)
    threading.Thread(target=server.serve_forever, name="status-server", daemon=True).start()
    return server


# --------------------------------------------------------------------------- #
# Entry point
# --------------------------------------------------------------------------- #


def install_signal_handlers(monitor: Monitor) -> None:
    def handle(signum: int, _frame: object) -> None:
        logger.info(f"Received {signal.Signals(signum).name}, shutting down")
        monitor.stop()

    signal.signal(signal.SIGINT, handle)
    signal.signal(signal.SIGTERM, handle)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Periodically check that a Render deployment is reachable.")
    parser.add_argument("--once", action="store_true", help="run a single check and exit 0 (ok) or 1 (failed)")
    parser.add_argument("--env-file", type=Path, default=DEFAULT_ENV_FILE, help="optional KEY=VALUE file")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(message)s", stream=sys.stdout)

    try:
        # Real environment variables win over the file.
        config = load_config({**read_env_file(args.env_file), **os.environ})
    except ConfigError as exc:
        logger.error(f"Configuration error: {exc}")
        return 2

    monitor = Monitor(config)
    install_signal_handlers(monitor)

    if args.once:
        return 0 if monitor.check_once().ok else 1

    server = None
    if config.status_port:
        try:
            server = start_status_server(monitor)
            logger.info(f"Status endpoint: http://{config.status_host}:{config.status_port}/status")
        except OSError as exc:
            # The status page is optional; keep-alive checks matter more than an unavailable port.
            logger.warning(
                f"Status endpoint disabled: cannot bind {config.status_host}:{config.status_port} "
                f"({exc.strerror or exc.__class__.__name__}). Health checks continue."
            )
    try:
        monitor.run()
    finally:
        if server:
            server.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
