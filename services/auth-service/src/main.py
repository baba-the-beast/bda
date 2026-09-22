"""
Identity and Authentication Microservice.
Provides Argon2id/PBKDF2 hashing, JWT access/refresh token rotation,
role-based access control, security event auditing, and session tracking.
"""

import os
import sys
import uuid
from contextlib import asynccontextmanager
from datetime import UTC, datetime

from fastapi import Depends, FastAPI, Header, Request, Response, status
from fastapi.responses import JSONResponse
from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest
from pydantic import BaseModel, EmailStr

# Add project root to path if running directly
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..")))

from shared.errors import AuthenticationException, ConflictException, PlatformException
from shared.logger import get_logger
from shared.models import (
    AuditLogEntry,
    PublicRegistrationRequest,
    SecurityEventEntry,
    TokenResponse,
    UserResponse,
    UserRole,
)
from shared.repository import Repository
from shared.security import (
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    require_role,
    verify_password,
)

logger = get_logger("auth-service")

# Prometheus Metrics
AUTH_REQUESTS = Counter("auth_requests_total", "Total auth requests", ["endpoint", "status"])
AUTH_FAILURES = Counter("auth_failures_total", "Total failed login attempts", ["reason"])
AUTH_LATENCY = Histogram("auth_request_duration_seconds", "Latency of authentication operations", ["endpoint"])


def get_current_user(authorization: str | None = Header(None)) -> dict:
    if not authorization or not authorization.startswith("Bearer "):
        raise AuthenticationException("Missing or malformed Authorization header")
    token = authorization.split(" ")[1]
    payload = decode_token(token, expected_type="access")
    user = Repository.get_user_by_id(payload.sub)
    if not user or not user.get("is_active", True):
        raise AuthenticationException("User account is inactive or not found")
    return user


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Seed default system users ONLY if explicitly enabled (e.g., local development)
    enable_demo_seed = os.getenv("ENABLE_DEMO_SEED", "false").lower() in ("true", "1")
    if enable_demo_seed:
        if not Repository.get_user_by_email("admin@bda-energy.internal"):
            admin_doc = {
                "id": str(uuid.uuid4()),
                "email": "admin@bda-energy.internal",
                "full_name": "System Administrator",
                "hashed_password": hash_password("AdminPass123!"),
                "role": UserRole.ADMIN.value,
                "workspace_id": "default-workspace",
                "is_active": True,
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC),
            }
            Repository.save_user(admin_doc)
            logger.info("Default administrator account initialized: admin@bda-energy.internal")

        if not Repository.get_user_by_email("analyst@bda-energy.internal"):
            analyst_doc = {
                "id": str(uuid.uuid4()),
                "email": "analyst@bda-energy.internal",
                "full_name": "Senior Energy Analyst",
                "hashed_password": hash_password("AnalystPass123!"),
                "role": UserRole.ANALYST.value,
                "workspace_id": "default-workspace",
                "is_active": True,
                "created_at": datetime.now(UTC),
                "updated_at": datetime.now(UTC),
            }
            Repository.save_user(analyst_doc)
            logger.info("Default analyst account initialized: analyst@bda-energy.internal")
    else:
        logger.info("ENABLE_DEMO_SEED is false: Production zero-default credential mode enforced.")

    yield



app = FastAPI(
    title="Energy Platform Identity & Auth Service",
    version="1.0.0",
    docs_url="/docs",
    openapi_url="/openapi.json",
    lifespan=lifespan
)


@app.exception_handler(PlatformException)
async def platform_exception_handler(request: Request, exc: PlatformException):
    return exc.to_response()


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled internal error: {exc!s}", exc_info=exc)
    return JSONResponse(
        status_code=500,
        content={
            "error": {
                "code": "INTERNAL_SERVER_ERROR",
                "message": "An unexpected error occurred. Please contact the administrator.",
                "request_id": request.headers.get("X-Correlation-ID"),
                "details": [],
            }
        },
    )


# ---------------------------------------------------------------------------
# Health & Observability
# ---------------------------------------------------------------------------

@app.get("/health")
def health():
    return {"status": "UP", "service": "auth-service"}


@app.get("/ready")
def ready():
    return {"status": "READY", "service": "auth-service"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


# ---------------------------------------------------------------------------
# Authentication Endpoints
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class RefreshRequest(BaseModel):
    refresh_token: str


@app.post("/api/v1/auth/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register_user(payload: PublicRegistrationRequest, request: Request):
    """
    Public self-registration endpoint.
    Privilege escalation defended: Role is strictly locked to ANALYST and workspace to default.
    Administrative roles must be granted by an existing ADMIN.
    """
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    if Repository.get_user_by_email(payload.email):
        raise ConflictException(f"User with email '{payload.email}' already exists", request_id=corr_id)

    now = datetime.now(UTC)
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id,
        "email": payload.email,
        "full_name": payload.full_name,
        "hashed_password": hash_password(payload.password),
        "role": UserRole.ANALYST.value,
        "workspace_id": "default-workspace",
        "is_active": True,
        "created_at": now,
        "updated_at": now,
    }
    Repository.save_user(user_doc)

    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=payload.email,
            action="USER_REGISTER",
            target_resource=f"user:{user_id}",
            result="SUCCESS",
            status_code=201,
            request_id=corr_id,
        )
    )

    clean_user = {k: v for k, v in user_doc.items() if k != "hashed_password"}
    return clean_user


@app.post("/api/v1/auth/login", response_model=TokenResponse)
def login(creds: LoginRequest, request: Request):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    with AUTH_LATENCY.labels(endpoint="/login").time():
        user = Repository.get_user_by_email(creds.email)
        if not user or not verify_password(creds.password, user.get("hashed_password", "")):
            AUTH_FAILURES.labels(reason="invalid_credentials").inc()
            Repository.log_security_event(
                SecurityEventEntry(
                    id=str(uuid.uuid4()),
                    event_type="LOGIN_FAILED",
                    severity="MEDIUM",
                    actor=creds.email,
                    request_id=corr_id,
                    details={"reason": "Invalid email or password"},
                )
            )
            raise AuthenticationException("Invalid email or password", request_id=corr_id)

        if not user.get("is_active", True):
            AUTH_FAILURES.labels(reason="account_locked").inc()
            raise AuthenticationException("Account is deactivated", request_id=corr_id)

        role = UserRole(user.get("role", "ANALYST"))
        access_token = create_access_token(
            user_id=user["id"],
            email=user["email"],
            role=role,
            workspace_id=user.get("workspace_id", "default-workspace"),
        )
        refresh_token = create_refresh_token(
            user_id=user["id"],
            email=user["email"],
            role=role,
            workspace_id=user.get("workspace_id", "default-workspace"),
        )

        # Track active refresh token session in MongoDB
        ref_payload = decode_token(refresh_token, expected_type="refresh")
        session_record = {
            "id": str(uuid.uuid4()),
            "jti": ref_payload.jti,
            "user_id": user["id"],
            "email": user["email"],
            "created_at": datetime.now(UTC),
            "expires_at": datetime.fromtimestamp(ref_payload.exp, UTC),
            "is_revoked": False,
        }
        Repository.save_session(session_record)

        AUTH_REQUESTS.labels(endpoint="/login", status="200").inc()
        Repository.log_audit_event(
            AuditLogEntry(
                id=str(uuid.uuid4()),
                actor=creds.email,
                action="USER_LOGIN",
                target_resource=f"user:{user['id']}",
                result="SUCCESS",
                status_code=200,
                request_id=corr_id,
            )
        )

        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",  # noqa: S106
            expires_in=900,
        )


@app.post("/api/v1/auth/refresh", response_model=TokenResponse)
def refresh_token_endpoint(payload: RefreshRequest, request: Request):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
    token_data = decode_token(payload.refresh_token, expected_type="refresh")
    
    # Check session revocation status
    session = Repository.get_session(token_data.jti)
    if session and session.get("is_revoked", False):
        # Refresh token reuse / compromised token alert! Revoke all sessions for safety.
        Repository.revoke_all_user_sessions(token_data.sub)
        Repository.log_security_event(
            SecurityEventEntry(
                id=str(uuid.uuid4()),
                event_type="TOKEN_REUSE_REVOKED",
                severity="CRITICAL",
                actor=token_data.email,
                request_id=corr_id,
                details={"jti": token_data.jti, "message": "Attempted reuse of revoked refresh token."},
            )
        )
        raise AuthenticationException(
            "Revoked refresh token presented. All active sessions have been invalidated for security.",
            request_id=corr_id,
        )

    user = Repository.get_user_by_id(token_data.sub)
    if not user or not user.get("is_active", True):
        raise AuthenticationException("Invalid refresh token or inactive account", request_id=corr_id)

    # Invalidate previous refresh token (Rotation)
    Repository.revoke_session(token_data.jti)

    role = UserRole(user.get("role", "ANALYST"))
    new_access = create_access_token(
        user_id=user["id"],
        email=user["email"],
        role=role,
        workspace_id=user.get("workspace_id", "default-workspace"),
    )
    new_refresh = create_refresh_token(
        user_id=user["id"],
        email=user["email"],
        role=role,
        workspace_id=user.get("workspace_id", "default-workspace"),
    )

    # Track new refresh token session
    new_ref_payload = decode_token(new_refresh, expected_type="refresh")
    Repository.save_session({
        "id": str(uuid.uuid4()),
        "jti": new_ref_payload.jti,
        "user_id": user["id"],
        "email": user["email"],
        "created_at": datetime.now(UTC),
        "expires_at": datetime.fromtimestamp(new_ref_payload.exp, UTC),
        "is_revoked": False,
    })

    return TokenResponse(
        access_token=new_access,
        refresh_token=new_refresh,
        token_type="bearer",  # noqa: S106
        expires_in=900,
    )


@app.post("/api/v1/auth/logout")
def logout(current_user: dict = Depends(get_current_user), request: Request = None):
    corr_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4())) if request else None
    # Revoke all active sessions for the user upon explicit logout
    revoked_count = Repository.revoke_all_user_sessions(current_user["id"])
    Repository.log_audit_event(
        AuditLogEntry(
            id=str(uuid.uuid4()),
            actor=current_user["email"],
            action="USER_LOGOUT",
            target_resource=f"user:{current_user['id']}",
            result="SUCCESS",
            status_code=200,
            request_id=corr_id,
            details={"revoked_sessions_count": revoked_count},
        )
    )
    return {"message": "Successfully logged out", "sessions_revoked": revoked_count}



@app.get("/api/v1/auth/me", response_model=UserResponse)
def get_profile(current_user: dict = Depends(get_current_user)):
    clean_user = {k: v for k, v in current_user.items() if k != "hashed_password"}
    return clean_user


@app.get("/api/v1/auth/users", response_model=list[UserResponse])
def list_users(current_user: dict = Depends(get_current_user)):
    require_role(UserRole(current_user.get("role")), [UserRole.ADMIN])
    users = Repository.list_users(workspace_id=current_user.get("workspace_id"))
    return [{k: v for k, v in u.items() if k != "hashed_password"} for u in users]


@app.get("/api/v1/auth/audit-logs", response_model=list[AuditLogEntry])
def get_audit_logs(limit: int = 50, current_user: dict = Depends(get_current_user)):
    require_role(UserRole(current_user.get("role")), [UserRole.ADMIN, UserRole.ANALYST])
    return Repository.list_audit_logs(limit=limit)


@app.get("/api/v1/auth/security-events", response_model=list[SecurityEventEntry])
def get_security_events(limit: int = 50, current_user: dict = Depends(get_current_user)):
    require_role(UserRole(current_user.get("role")), [UserRole.ADMIN])
    return Repository.list_security_events(limit=limit)
