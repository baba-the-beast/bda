"""
Security Hardening & Threat Regression Tests.
Verifies defense against privilege escalation, refresh token replay,
arbitrary path traversal, datastore fail-closed behavior, and Zip Slip attacks.
"""

import io
import os
import tempfile
import zipfile
import pytest
from pydantic import ValidationError

from shared.errors import (
    AuthenticationException, AuthorizationException,
    DatabaseConnectionException, ValidationException
)
from shared.models import PublicRegistrationRequest, UserRole
from shared.repository import Repository, _get_active_db
from shared.security import create_refresh_token, decode_token
from scripts.prepare_dataset import safe_extract_zip


def test_public_registration_cannot_specify_role():
    """
    Verifies that PublicRegistrationRequest strictly refuses client-specified role or workspace,
    preventing privilege escalation attacks.
    """
    # Valid payload
    req = PublicRegistrationRequest(
        email="newuser@bda-energy.internal",
        full_name="New User",
        password="SecurePassword123!"
    )
    assert req.email == "newuser@bda-energy.internal"

    # Verify that model has no role or workspace_id fields
    fields = PublicRegistrationRequest.model_fields
    assert "role" not in fields
    assert "workspace_id" not in fields
    assert "is_active" not in fields


def test_refresh_token_session_tracking_and_revocation():
    """
    Verifies server-side refresh token lifecycle:
    1. Token creation produces valid jti
    2. Session is tracked in repository
    3. Session revocation marks token invalid
    """
    token = create_refresh_token(
        user_id="user_test_99",
        email="analyst@bda-energy.internal",
        role=UserRole.ANALYST,
        workspace_id="test-workspace",
    )
    payload = decode_token(token, expected_type="refresh")
    assert payload.jti is not None

    # Track session
    session_doc = {
        "id": "sess_01",
        "jti": payload.jti,
        "user_id": "user_test_99",
        "email": "analyst@bda-energy.internal",
        "is_revoked": False,
    }
    Repository.save_session(session_doc)

    retrieved = Repository.get_session(payload.jti)
    assert retrieved is not None
    assert retrieved["is_revoked"] is False

    # Revoke session
    revoked = Repository.revoke_session(payload.jti)
    assert revoked is True

    updated = Repository.get_session(payload.jti)
    assert updated["is_revoked"] is True


def test_datastore_fail_closed_in_mongodb_mode(monkeypatch):
    """
    Verifies that DATA_STORE_MODE=mongodb fails closed with DatabaseConnectionException
    when MongoDB is unreachable, preventing silent fallback to in-memory store.
    """
    monkeypatch.setenv("DATA_STORE_MODE", "mongodb")
    # Mock raw get_database to return None (simulating offline cluster)
    monkeypatch.setattr("shared.repository._raw_get_database", lambda: None)

    with pytest.raises(DatabaseConnectionException) as exc:
        _get_active_db()

    assert "CRITICAL DATASTORE ERROR" in str(exc.value)
    assert "Silent fallback to in-memory store is disabled" in str(exc.value)


def test_zip_slip_path_traversal_prevention():
    """
    Verifies that safe_extract_zip rejects archive entries attempting
    Zip Slip path traversal (e.g. entries with ../).
    """
    with tempfile.TemporaryDirectory() as temp_dir:
        tmp_zip_path = os.path.join(temp_dir, "malicious.zip")
        extract_dir = os.path.join(temp_dir, "extracted")

        # Create malicious zip with ../ entry
        with zipfile.ZipFile(tmp_zip_path, "w") as zf:
            zf.writestr("../evil.txt", "malicious payload")

        with pytest.raises(ValueError) as exc:
            safe_extract_zip(tmp_zip_path, extract_dir)
        assert "Path traversal detected" in str(exc.value)


def test_zip_bomb_size_limit_prevention(monkeypatch):
    """
    Verifies that safe_extract_zip rejects zip archives exceeding size thresholds.
    """
    import scripts.prepare_dataset as prep
    monkeypatch.setattr(prep, "MAX_UNCOMPRESSED_SIZE_BYTES", 500)

    with tempfile.TemporaryDirectory() as temp_dir:
        tmp_zip_path = os.path.join(temp_dir, "bomb.zip")
        extract_dir = os.path.join(temp_dir, "extracted")

        # Create zip with 1000 bytes uncompressed
        with zipfile.ZipFile(tmp_zip_path, "w") as zf:
            zf.writestr("household_power_consumption.txt", b"x" * 1000)

        with pytest.raises(ValueError) as exc:
            safe_extract_zip(tmp_zip_path, extract_dir)
        assert "exceeds safety limit" in str(exc.value)
