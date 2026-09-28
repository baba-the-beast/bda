"""Tests for the standalone Render keep-alive monitor (tools/render_monitor)."""

import json
import signal
import threading
import time
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib import request

import pytest

from tools.render_monitor import monitor as rm


@contextmanager
def fake_server(status=200, delay=0.0):
    """Local HTTP server standing in for the Render deployment."""
    hits = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            hits.append(self.path)
            time.sleep(delay)
            body = json.dumps({"status": "UP"}).encode()
            try:
                self.send_response(status)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except OSError:
                pass  # client gave up (timeout test)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}", hits
    finally:
        server.shutdown()
        server.server_close()


def make_config(url, **overrides):
    return rm.Config(
        **{
            "render_url": url,
            "request_timeout_seconds": 2,
            "max_retries": 2,
            "retry_backoff_seconds": 0,
            **overrides,
        }
    )


# --------------------------------------------------------------------------- #
# Configuration loading
# --------------------------------------------------------------------------- #


def test_config_defaults():
    cfg = rm.load_config({"RENDER_URL": "https://my-app.onrender.com/"})
    assert cfg.render_url == "https://my-app.onrender.com"
    assert cfg.target_url == "https://my-app.onrender.com/health"
    assert cfg.ping_interval_minutes == 10
    assert cfg.request_timeout_seconds == 30
    assert cfg.max_retries == 2
    assert cfg.status_port is None
    assert cfg.log_format == "text"


def test_config_overrides():
    cfg = rm.load_config(
        {
            "RENDER_URL": "https://my-app.onrender.com",
            "HEALTH_PATH": "api/health",
            "PING_INTERVAL_MINUTES": "14",
            "REQUEST_TIMEOUT_SECONDS": "45",
            "MAX_RETRIES": "3",
            "RETRY_BACKOFF_SECONDS": "5",
            "STATUS_PORT": "8099",
            "LOG_FORMAT": "JSON",
        }
    )
    assert cfg.target_url == "https://my-app.onrender.com/api/health"
    assert (cfg.ping_interval_minutes, cfg.request_timeout_seconds) == (14, 45)
    assert (cfg.max_retries, cfg.retry_backoff_seconds) == (3, 5)
    assert cfg.status_port == 8099
    assert cfg.log_format == "json"


@pytest.mark.parametrize(
    "url",
    [
        "",
        "my-app.onrender.com",
        "ftp://my-app.onrender.com",
        "https://",
        "https://user:secret@my-app.onrender.com",
        "https://my-app.onrender.com/?token=abc",
        "https://my app.onrender.com",
        "https://[::1",
        "https://my-app.onrender.com:99999",
        "https://my-app.onrender.com:abc",
    ],
)
def test_invalid_url_rejected(url):
    with pytest.raises(rm.ConfigError):
        rm.load_config({"RENDER_URL": url})


def test_credentials_never_echoed_in_config_error():
    with pytest.raises(rm.ConfigError) as exc:
        rm.load_config({"RENDER_URL": "https://user:hunter2@my-app.onrender.com"})
    assert "hunter2" not in str(exc.value)


@pytest.mark.parametrize(
    ("key", "value"),
    [
        ("PING_INTERVAL_MINUTES", "0.5"),
        ("PING_INTERVAL_MINUTES", "ten"),
        ("REQUEST_TIMEOUT_SECONDS", "0"),
        ("MAX_RETRIES", "9"),
        ("STATUS_PORT", "70000"),
        ("LOG_FORMAT", "xml"),
        ("HEALTH_PATH", "/C:/Program Files/Git/health"),
        ("HEALTH_PATH", "/health?x=1"),
    ],
)
def test_invalid_numbers_rejected(key, value):
    with pytest.raises(rm.ConfigError):
        rm.load_config({"RENDER_URL": "https://my-app.onrender.com", key: value})


def test_self_ping_refused_inside_render():
    with pytest.raises(rm.ConfigError, match="independent"):
        rm.load_config(
            {
                "RENDER_URL": "https://my-app.onrender.com",
                "RENDER_EXTERNAL_URL": "https://my-app.onrender.com",
            }
        )


def test_env_file_parsing(tmp_path):
    env_file = tmp_path / ".env"
    env_file.write_text(
        '# comment\nRENDER_URL="https://my-app.onrender.com"\nexport PING_INTERVAL_MINUTES=12\n\nJUNK\n',
        encoding="utf-8",
    )
    assert rm.read_env_file(env_file) == {
        "RENDER_URL": "https://my-app.onrender.com",
        "PING_INTERVAL_MINUTES": "12",
    }
    assert rm.read_env_file(tmp_path / "missing") == {}


# --------------------------------------------------------------------------- #
# Health checks against a real local HTTP server
# --------------------------------------------------------------------------- #


def test_successful_health_check():
    with fake_server(200) as (url, hits):
        mon = rm.Monitor(make_config(url))
        result = mon.check_once()
    assert result.ok and result.status == 200 and result.attempts == 1
    assert result.elapsed_ms >= 0
    assert hits == ["/health"]
    snap = mon.stats.snapshot()
    assert snap["successful_checks"] == 1 and snap["uptime_percent"] == 100.0
    assert snap["last_success"] is not None and snap["last_failure"] is None


def test_http_failure_reports_status_and_retries():
    with fake_server(503) as (url, hits):
        mon = rm.Monitor(make_config(url, max_retries=2))
        result = mon.check_once()
    assert not result.ok
    assert result.status == 503
    assert result.error == "HTTP 503"
    assert result.attempts == 3 and len(hits) == 3
    assert mon.stats.snapshot()["failed_checks"] == 1


def test_client_error_is_not_retried():
    with fake_server(404) as (url, hits):
        result = rm.Monitor(make_config(url)).check_once()
    assert result.status == 404 and result.attempts == 1 and len(hits) == 1


def test_timeout():
    with fake_server(200, delay=1.5) as (url, _):
        probe = rm.http_get(url + "/health", timeout=0.3)
    assert probe.status is None
    assert "timeout" in probe.error.lower()
    assert not probe.ok and probe.retryable


def test_connection_refused_does_not_raise():
    with fake_server() as (url, _):
        pass  # server is now closed; port refuses connections
    probe = rm.http_get(url + "/health", timeout=2)
    assert probe.status is None and probe.error.startswith("Connection")


def test_malformed_request_url_does_not_raise():
    probe = rm.http_get("http://127.0.0.1:9/he alth", timeout=2)
    assert probe.status is None and not probe.ok and "control characters" in probe.error


# --------------------------------------------------------------------------- #
# Retry behaviour with a scripted fetch
# --------------------------------------------------------------------------- #


def test_retry_uses_exponential_backoff_then_succeeds():
    responses = [rm.Probe(None, 5, "Connection timeout"), rm.Probe(502, 5, "HTTP 502"), rm.Probe(200, 7, None)]
    waits = []

    def fetch(url, timeout):
        return responses.pop(0)

    def wait(seconds):
        waits.append(seconds)
        return False

    cfg = make_config("https://my-app.onrender.com", max_retries=3, retry_backoff_seconds=2)
    result = rm.Monitor(cfg, fetch=fetch, wait=wait).check_once()
    assert result.ok and result.attempts == 3
    assert waits == [2, 4]


def test_retries_are_capped():
    calls = []

    def fetch(url, timeout):
        calls.append(url)
        return rm.Probe(None, 1, "Connection error")

    cfg = make_config("https://my-app.onrender.com", max_retries=1)
    result = rm.Monitor(cfg, fetch=fetch, wait=lambda s: False).check_once()
    assert not result.ok and len(calls) == 2


def test_stats_aggregate_over_checks():
    results = iter([rm.Probe(200, 100, None), rm.Probe(200, 300, None), rm.Probe(500, 50, "HTTP 500")])
    cfg = make_config("https://my-app.onrender.com", max_retries=0)
    mon = rm.Monitor(cfg, fetch=lambda u, t: next(results))
    for _ in range(3):
        mon.check_once()
    snap = mon.stats.snapshot()
    assert (snap["total_checks"], snap["successful_checks"], snap["failed_checks"]) == (3, 2, 1)
    assert snap["avg_response_ms"] == 200
    assert snap["uptime_percent"] == pytest.approx(66.67)


# --------------------------------------------------------------------------- #
# Logging hygiene
# --------------------------------------------------------------------------- #


def test_log_line_has_required_fields(caplog):
    cfg = make_config("https://my-app.onrender.com", log_format="json")
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(200, 842, None))
    with caplog.at_level("INFO", logger="render_monitor"):
        mon.check_once()
    record = json.loads(caplog.records[-1].getMessage())
    assert record["event"] == "ok"
    assert record["url"] == "https://my-app.onrender.com"
    assert record["endpoint"] == "/health"
    assert record["status"] == 200
    assert record["response_ms"] == 842
    assert "timestamp" in record


def test_secrets_in_environment_are_never_logged(caplog, monkeypatch):
    monkeypatch.setenv("JWT_SECRET", "super-secret-jwt")
    monkeypatch.setenv("MONGO_URI", "mongodb://u:dbpass@host/db")
    cfg = rm.load_config({"RENDER_URL": "https://my-app.onrender.com", "JWT_SECRET": "super-secret-jwt"})
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(500, 1, "HTTP 500"), wait=lambda s: False)
    with caplog.at_level("DEBUG", logger="render_monitor"):
        mon.check_once()
        mon.log_stats()
    assert "super-secret-jwt" not in caplog.text
    assert "dbpass" not in caplog.text


# --------------------------------------------------------------------------- #
# Graceful shutdown
# --------------------------------------------------------------------------- #


def test_run_stops_promptly_during_interval():
    cfg = make_config("https://my-app.onrender.com", ping_interval_minutes=60)
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(200, 1, None))
    thread = threading.Thread(target=mon.run)
    thread.start()
    time.sleep(0.2)
    mon.stop()
    thread.join(timeout=5)
    assert not thread.is_alive()
    assert mon.stats.total == 1


def test_stop_during_backoff_aborts_retries():
    calls = []
    cfg = make_config("https://my-app.onrender.com", max_retries=5, retry_backoff_seconds=60)
    mon = rm.Monitor(cfg, fetch=lambda u, t: calls.append(u) or rm.Probe(None, 1, "Connection error"))
    threading.Timer(0.2, mon.stop).start()
    started = time.monotonic()
    result = mon.check_once()
    assert time.monotonic() - started < 5
    assert not result.ok and result.interrupted and len(calls) == 1
    # A shutdown is not an outage: nothing is recorded.
    assert mon.stats.snapshot()["total_checks"] == 0


def test_run_exits_after_interrupted_check_without_counting_it():
    cfg = make_config("https://my-app.onrender.com", max_retries=5, retry_backoff_seconds=60, stats_every=1)
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(None, 1, "Connection error"))
    threading.Timer(0.2, mon.stop).start()
    thread = threading.Thread(target=mon.run)
    thread.start()
    thread.join(timeout=5)
    assert not thread.is_alive()
    snap = mon.stats.snapshot()
    assert (snap["total_checks"], snap["failed_checks"], snap["uptime_percent"]) == (0, 0, None)


@pytest.mark.parametrize("sig", [signal.SIGINT, signal.SIGTERM])
def test_signal_handlers_request_stop(sig):
    mon = rm.Monitor(make_config("https://my-app.onrender.com"))
    previous = {s: signal.getsignal(s) for s in (signal.SIGINT, signal.SIGTERM)}
    try:
        rm.install_signal_handlers(mon)
        signal.getsignal(sig)(sig, None)
        assert mon.stopping
    finally:
        for s, handler in previous.items():
            signal.signal(s, handler)


# --------------------------------------------------------------------------- #
# Entry point and status endpoint
# --------------------------------------------------------------------------- #


def test_main_reports_unparseable_url_as_config_error(monkeypatch, tmp_path):
    monkeypatch.setenv("RENDER_URL", "https://[::1")
    assert rm.main(["--once", "--env-file", str(tmp_path / "none")]) == 2


def test_main_once_exit_codes(monkeypatch, tmp_path):
    missing_env = ["--env-file", str(tmp_path / "none")]
    monkeypatch.delenv("RENDER_EXTERNAL_URL", raising=False)
    with fake_server(200) as (url, _):
        monkeypatch.setenv("RENDER_URL", url)
        assert rm.main(["--once", *missing_env]) == 0
    with fake_server(404) as (url, _):
        monkeypatch.setenv("RENDER_URL", url)
        assert rm.main(["--once", *missing_env]) == 1
    monkeypatch.setenv("RENDER_URL", "not a url")
    assert rm.main(["--once", *missing_env]) == 2


def test_status_endpoint_serves_stats():
    cfg = make_config("https://my-app.onrender.com", status_port=None)
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(200, 10, None))
    mon.check_once()
    server = rm.start_status_server(mon)
    try:
        port = server.server_address[1]
        with request.urlopen(f"http://127.0.0.1:{port}/status", timeout=5) as resp:
            body = json.loads(resp.read())
    finally:
        server.shutdown()
        server.server_close()
    assert body["target"] == "https://my-app.onrender.com/health"
    assert body["total_checks"] == 1 and body["uptime_percent"] == 100.0


def test_real_signal_interrupts_long_interval():
    """SIGINT delivered while run() sits in a 60-minute wait must end it within seconds."""
    cfg = make_config("https://my-app.onrender.com", ping_interval_minutes=60)
    mon = rm.Monitor(cfg, fetch=lambda u, t: rm.Probe(200, 1, None))
    previous = signal.getsignal(signal.SIGINT)
    try:
        rm.install_signal_handlers(mon)
        threading.Timer(0.5, signal.raise_signal, args=(signal.SIGINT,)).start()
        started = time.monotonic()
        mon.run()  # main thread, as in production
        assert time.monotonic() - started < 5
        assert mon.stopping and mon.stats.total == 1
    finally:
        signal.signal(signal.SIGINT, previous)
