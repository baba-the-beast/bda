"""
Stream ticket authentication tests.

EventSource cannot set an Authorization header, so the SSE endpoint previously
accepted a full 15-minute access token in the query string, where it reaches
access logs, proxies and browser history. It now takes a 30-second, stream-only
ticket instead. These tests pin that boundary.
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, BASE_DIR)

from scripts.dev_server import dev_app, stream_mod
from shared.errors import AuthenticationException
from shared.models import UserRole
from shared.security import (
    STREAM_TICKET_EXPIRE_SECONDS,
    create_access_token,
    create_refresh_token,
    create_stream_ticket,
    decode_token,
)

ACTOR = {
    "user_id": "user-stream-1",
    "email": "analyst@bda-energy.internal",
    "role": UserRole.ANALYST,
}


@pytest.fixture
def client():
    with TestClient(dev_app) as c:
        yield c


def test_ticket_is_stream_typed_and_short_lived():
    ticket = create_stream_ticket(**ACTOR)
    payload = decode_token(ticket, expected_type="stream")

    assert payload.email == ACTOR["email"]
    lifetime = payload.exp - payload.iat
    assert lifetime == STREAM_TICKET_EXPIRE_SECONDS
    assert lifetime <= 60, "A ticket in a URL must not be long-lived"


def test_ticket_is_not_accepted_as_an_access_token():
    """A leaked ticket must not unlock the rest of the API."""
    ticket = create_stream_ticket(**ACTOR)
    with pytest.raises(AuthenticationException):
        decode_token(ticket, expected_type="access")


def test_access_and_refresh_tokens_are_not_accepted_as_tickets():
    """Token types are not interchangeable in either direction."""
    for token in (create_access_token(**ACTOR), create_refresh_token(**ACTOR)):
        with pytest.raises(AuthenticationException):
            decode_token(token, expected_type="stream")


def test_ticket_endpoint_requires_authentication(client):
    response = client.post("/api/v1/stream/ticket")
    assert response.status_code in (401, 403)


def test_ticket_endpoint_issues_a_usable_ticket(client):
    access = create_access_token(**ACTOR)
    response = client.post(
        "/api/v1/stream/ticket", headers={"Authorization": f"Bearer {access}"}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["expires_in"] == STREAM_TICKET_EXPIRE_SECONDS

    issued = decode_token(body["ticket"], expected_type="stream")
    assert issued.email == ACTOR["email"]
    assert issued.role == UserRole.ANALYST


def test_live_stream_rejects_a_garbage_ticket(client):
    response = client.get("/api/v1/stream/live?ticket=not-a-real-ticket")
    assert response.status_code in (401, 403)


def test_live_stream_rejects_an_access_token_in_the_query_string(client):
    """The old ?token= path is gone: an access token in a URL is refused."""
    access = create_access_token(**ACTOR)
    response = client.get(f"/api/v1/stream/live?ticket={access}")
    assert response.status_code in (401, 403)


def test_stream_endpoint_no_longer_reads_a_token_query_parameter():
    """Guards against the old parameter being reintroduced."""
    import inspect

    signature = inspect.signature(stream_mod.live_stream_feed)
    assert "token" not in signature.parameters
    assert "ticket" in signature.parameters
