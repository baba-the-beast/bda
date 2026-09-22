"""
Unit tests for security utilities, password hashing, JWT lifecycle, and RBAC authorization.
"""

from datetime import timedelta
import pytest
from shared.models import UserRole
from shared.security import (
    hash_password, verify_password, create_access_token, create_refresh_token,
    decode_token, require_role, ROLE_HIERARCHY
)
from shared.errors import AuthenticationException, AuthorizationException


def test_password_hashing():
    pwd = "SuperSecretPassword123!"
    hashed = hash_password(pwd)
    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_access_token_lifecycle():
    token = create_access_token(
        user_id="user_123",
        email="analyst@bda-energy.internal",
        role=UserRole.ANALYST,
        workspace_id="ws_energy",
    )
    payload = decode_token(token, expected_type="access")
    assert payload.sub == "user_123"
    assert payload.email == "analyst@bda-energy.internal"
    assert payload.role == UserRole.ANALYST
    assert payload.workspace_id == "ws_energy"


def test_jwt_refresh_token_isolation():
    refresh_tok = create_refresh_token(
        user_id="user_456",
        email="admin@bda-energy.internal",
        role=UserRole.ADMIN,
    )
    # Decoding a refresh token with expected_type="access" must fail
    with pytest.raises(AuthenticationException) as exc:
        decode_token(refresh_tok, expected_type="access")
    assert "Invalid token type" in str(exc.value)

    # Decoding with expected_type="refresh" succeeds
    payload = decode_token(refresh_tok, expected_type="refresh")
    assert payload.sub == "user_456"


def test_jwt_expiration():
    # Expired token
    token = create_access_token(
        user_id="user_expired",
        email="test@bda.internal",
        role=UserRole.VIEWER,
        expires_delta=timedelta(seconds=-10),
    )
    with pytest.raises(AuthenticationException) as exc:
        decode_token(token, expected_type="access")
    assert "expired" in str(exc.value).lower()


def test_rbac_hierarchy():
    # Admin can perform Admin, Analyst, Viewer operations
    require_role(UserRole.ADMIN, [UserRole.ADMIN])
    require_role(UserRole.ADMIN, [UserRole.ANALYST])
    require_role(UserRole.ADMIN, [UserRole.VIEWER])

    # Analyst can perform Analyst and Viewer operations, but NOT Admin
    require_role(UserRole.ANALYST, [UserRole.ANALYST])
    require_role(UserRole.ANALYST, [UserRole.VIEWER])
    with pytest.raises(AuthorizationException):
        require_role(UserRole.ANALYST, [UserRole.ADMIN])

    # Viewer can only perform Viewer operations
    require_role(UserRole.VIEWER, [UserRole.VIEWER])
    with pytest.raises(AuthorizationException):
        require_role(UserRole.VIEWER, [UserRole.ANALYST])
    with pytest.raises(AuthorizationException):
        require_role(UserRole.VIEWER, [UserRole.ADMIN])
