"""
Security utilities: Password hashing, JWT token lifecycle, and RBAC authorization policies.
"""

import os
import uuid
from datetime import UTC, datetime, timedelta

import jwt
from passlib.context import CryptContext
from pydantic import ValidationError

from shared.errors import AuthenticationException, AuthorizationException
from shared.models import TokenPayload, UserRole

# Cryptographic configuration: Argon2id prioritized with PBKDF2/Bcrypt backward compatibility
pwd_context = CryptContext(schemes=["argon2", "pbkdf2_sha256", "bcrypt"], deprecated="auto")

INSECURE_DEV_SECRET = "super-secret-production-key-must-be-rotated-in-production-env-32bytes"  # noqa: S105
_RAW_JWT_SECRET = os.getenv("JWT_SECRET")
ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()

if not _RAW_JWT_SECRET:
    if ENVIRONMENT == "production":
        raise RuntimeError("CRITICAL SECURITY FAILURE: JWT_SECRET must be explicitly configured in production environments.")
    JWT_SECRET = INSECURE_DEV_SECRET
else:
    if ENVIRONMENT == "production" and (_RAW_JWT_SECRET == INSECURE_DEV_SECRET or len(_RAW_JWT_SECRET) < 32):
        raise RuntimeError("CRITICAL SECURITY FAILURE: JWT_SECRET in production must be a unique key with at least 32 characters.")
    JWT_SECRET = _RAW_JWT_SECRET

JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))
JWT_ISSUER = os.getenv("JWT_ISSUER", "bda.energy.platform")
JWT_AUDIENCE = os.getenv("JWT_AUDIENCE", "bda.energy.clients")


# Role hierarchy: ADMIN has all permissions, ANALYST can create/view, VIEWER is read-only
ROLE_HIERARCHY = {
    UserRole.ADMIN: [UserRole.ADMIN, UserRole.ANALYST, UserRole.VIEWER],
    UserRole.ANALYST: [UserRole.ANALYST, UserRole.VIEWER],
    UserRole.VIEWER: [UserRole.VIEWER],
}


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(
    user_id: str,
    email: str,
    role: UserRole,
    workspace_id: str = "default-workspace",
    expires_delta: timedelta | None = None,
) -> str:
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    
    payload = {
        "sub": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "workspace_id": workspace_id,
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
        "token_type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_refresh_token(
    user_id: str,
    email: str,
    role: UserRole,
    workspace_id: str = "default-workspace",
) -> str:
    now = datetime.now(UTC)
    expire = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "workspace_id": workspace_id,
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
        "token_type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


# A stream ticket is deliberately short-lived. EventSource cannot set an
# Authorization header, so the credential has to travel in the URL, where it
# lands in access logs, proxy logs and browser history. Putting a 30-second,
# stream-only token there instead of a 15-minute full-access JWT bounds the
# exposure to a window too small to replay by hand, and the ticket authorises
# nothing beyond reading the telemetry feed.
STREAM_TICKET_EXPIRE_SECONDS = 30


def create_stream_ticket(
    user_id: str,
    email: str,
    role: UserRole,
    workspace_id: str = "default-workspace",
) -> str:
    now = datetime.now(UTC)
    expire = now + timedelta(seconds=STREAM_TICKET_EXPIRE_SECONDS)
    payload = {
        "sub": user_id,
        "email": email,
        "role": role.value if isinstance(role, UserRole) else role,
        "workspace_id": workspace_id,
        "exp": int(expire.timestamp()),
        "iat": int(now.timestamp()),
        "nbf": int(now.timestamp()),
        "iss": JWT_ISSUER,
        "aud": JWT_AUDIENCE,
        "jti": str(uuid.uuid4()),
        "token_type": "stream",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str, expected_type: str = "access") -> TokenPayload:
    try:
        raw_payload = jwt.decode(
            token,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            issuer=JWT_ISSUER,
            audience=JWT_AUDIENCE,
        )
        if raw_payload.get("token_type") != expected_type:
            raise AuthenticationException(f"Invalid token type. Expected '{expected_type}'")
        return TokenPayload(**raw_payload)
    except jwt.ExpiredSignatureError as e:
        raise AuthenticationException("Token has expired") from e
    except (jwt.InvalidTokenError, ValidationError) as e:
        raise AuthenticationException(f"Invalid token signature or payload: {e!s}") from e


def require_role(user_role: UserRole, required_roles: list[UserRole]) -> None:
    allowed = False
    for req in required_roles:
        if req in ROLE_HIERARCHY.get(user_role, []):
            allowed = True
            break
    if not allowed:
        raise AuthorizationException(f"Role '{user_role}' does not have required permissions ({[r.value for r in required_roles]})")
