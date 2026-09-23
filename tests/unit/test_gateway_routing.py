"""
API Gateway reverse-proxy routing tests.
Verifies that every registered path prefix resolves to the correct downstream
service base URL, that unregistered paths return the normalized 404 envelope,
and that correlation identifiers and query strings survive the proxy hop.
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, BASE_DIR)
from scripts.dev_server import load_service_app

gateway = load_service_app("api-gateway")


class _CapturedRequest:
    """Stands in for httpx.Request, recording what the gateway tried to send."""

    def __init__(self, method, url, headers, content):
        self.method = method
        self.url = url
        self.headers = headers
        self.content = content


class _StubResponse:
    status_code = 200
    headers = {"content-type": "application/json"}

    async def aiter_raw(self):
        yield b'{"proxied": true}'

    async def aclose(self):
        return None


class _StubClient:
    """Captures forwarded requests instead of opening a real connection."""

    def __init__(self):
        self.sent = []

    def build_request(self, method, url, headers, content):
        return _CapturedRequest(method, url, headers, content)

    async def send(self, request, stream=False):
        self.sent.append(request)
        return _StubResponse()

    async def aclose(self):
        return None


@pytest.fixture
def proxy():
    gateway.RATE_LIMIT_BUCKET.clear()
    stub = _StubClient()
    with TestClient(gateway.app) as client:
        # Replace the real AsyncClient opened by the lifespan handler
        gateway.http_client = stub
        yield client, stub


def test_preprocess_path_routes_to_preprocessing_service(proxy):
    """Regression guard: this branch previously raised NameError on every request."""
    client, stub = proxy
    resp = client.get("/api/v1/preprocess/status")

    assert resp.status_code == 200
    assert len(stub.sent) == 1
    assert stub.sent[0].url == f"{gateway.PREPROCESSING_URL}/api/v1/preprocess/status"


def test_quality_path_routes_to_preprocessing_service(proxy):
    client, stub = proxy
    resp = client.get("/api/v1/datasets/abc/quality")

    assert resp.status_code == 200
    assert stub.sent[0].url == f"{gateway.PREPROCESSING_URL}/api/v1/datasets/abc/quality"


@pytest.mark.parametrize("prefix", sorted(gateway.SERVICE_ROUTING.keys()))
def test_registered_prefix_routes_to_its_service(proxy, prefix):
    client, stub = proxy
    path = f"{prefix}/health"
    resp = client.get(path)

    assert resp.status_code == 200
    assert stub.sent[0].url == f"{gateway.SERVICE_ROUTING[prefix]}{path}"


def test_unregistered_path_returns_route_not_found_envelope(proxy):
    client, stub = proxy
    resp = client.get("/api/v1/nonexistent/resource")

    assert resp.status_code == 404
    body = resp.json()
    assert body["error"]["code"] == "ROUTE_NOT_FOUND"
    assert "/api/v1/nonexistent/resource" in body["error"]["message"]
    assert body["error"]["request_id"]
    assert stub.sent == []


def test_query_string_is_preserved_across_the_proxy(proxy):
    client, stub = proxy
    client.get("/api/v1/hive/query?template=daily&limit=10")

    assert stub.sent[0].url == (
        f"{gateway.SERVICE_ROUTING['/api/v1/hive']}/api/v1/hive/query?template=daily&limit=10"
    )


def test_correlation_id_is_forwarded_and_echoed(proxy):
    client, stub = proxy
    corr_id = "test-correlation-id-1234"
    resp = client.get("/api/v1/analytics/summary", headers={"X-Correlation-ID": corr_id})

    assert stub.sent[0].headers["X-Correlation-ID"] == corr_id
    assert resp.headers["X-Correlation-ID"] == corr_id
    assert "host" not in stub.sent[0].headers


def test_request_body_and_method_are_forwarded(proxy):
    client, stub = proxy
    client.post("/api/v1/jobs", json={"dataset_id": "ds-1"})

    assert stub.sent[0].method == "POST"
    assert b"ds-1" in stub.sent[0].content
