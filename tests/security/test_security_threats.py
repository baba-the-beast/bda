"""
Security Acceptance and Threat Model Verification Tests.
Fulfills Requirement 104:
Verifies rejection of unauthenticated requests, RBAC violations,
token tampering, and SQL injection payloads.
"""

import pytest
from fastapi.testclient import TestClient
from shared.models import UserRole
from shared.security import create_access_token
from shared.errors import AuthorizationException, ValidationException
from scripts.dev_server import dev_app, hive_mod
validate_query_safety = hive_mod.validate_query_safety

client = TestClient(dev_app)


def test_unauthenticated_request_rejected():
    # Attempting to access protected endpoints without Authorization header must fail
    res = client.get("/api/v1/auth/me")
    assert res.status_code == 401
    assert res.json()["error"]["code"] == "AUTHENTICATION_FAILED"


def test_token_tampering_rejected():
    token = create_access_token("u1", "user@bda.internal", UserRole.ANALYST)
    # Tamper with token signature
    tampered = token[:-5] + "XXXXX"
    res = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {tampered}"})
    assert res.status_code == 401


def test_rbac_write_restriction_for_viewer():
    viewer_token = create_access_token("u_viewer", "viewer@bda.internal", UserRole.VIEWER)
    # Viewer attempting to import dataset must be rejected with 403
    res = client.post(
        "/api/v1/datasets/import-local",
        headers={"Authorization": f"Bearer {viewer_token}"},
        json={"file_path": "data/sample.txt"}
    )
    assert res.status_code == 403
    assert res.json()["error"]["code"] == "PERMISSION_DENIED"


def test_sql_injection_rejection():
    dangerous_queries = [
        "SELECT * FROM energy_data; DROP TABLE energy_data;",
        "SELECT * FROM energy_data WHERE id = 1 UNION SELECT * FROM users",
        "TRUNCATE TABLE energy_data",
        "ALTER TABLE energy_data ADD COLUMN hack VARCHAR",
    ]
    for q in dangerous_queries:
        with pytest.raises(ValueError) as exc:
            validate_query_safety(q)
        assert "Dangerous" in str(exc.value)
