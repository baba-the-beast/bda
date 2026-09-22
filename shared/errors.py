"""
Structured error response model and custom exception hierarchy for the Energy Analytics Platform.
Follows RFC 7807-inspired standardized JSON error schemas.
"""

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse


class ErrorDetail(BaseModel):
    code: str = Field(..., description="Machine-readable error code")
    message: str = Field(..., description="Human-readable error description")
    request_id: Optional[str] = Field(None, description="Correlation identifier")
    details: Optional[List[Dict[str, Any]]] = Field(default_factory=list, description="Additional context")


class PlatformErrorResponse(BaseModel):
    error: ErrorDetail


class PlatformException(HTTPException):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: Optional[List[Dict[str, Any]]] = None,
        request_id: Optional[str] = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code
        self.message = message
        self.details = details or []
        self.request_id = request_id

    def to_response(self) -> JSONResponse:
        return JSONResponse(
            status_code=self.status_code,
            content={
                "error": {
                    "code": self.code,
                    "message": self.message,
                    "request_id": self.request_id,
                    "details": self.details,
                }
            },
        )


class ValidationException(PlatformException):
    def __init__(self, message: str, details: Optional[List[Dict[str, Any]]] = None, request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            code="VALIDATION_ERROR",
            message=message,
            details=details,
            request_id=request_id,
        )


class AuthenticationException(PlatformException):
    def __init__(self, message: str = "Invalid or expired credentials", request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTHENTICATION_FAILED",
            message=message,
            request_id=request_id,
        )


class AuthorizationException(PlatformException):
    def __init__(self, message: str = "Insufficient permissions", request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_403_FORBIDDEN,
            code="PERMISSION_DENIED",
            message=message,
            request_id=request_id,
        )


class NotFoundException(PlatformException):
    def __init__(self, resource: str, identifier: str, request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_404_NOT_FOUND,
            code="RESOURCE_NOT_FOUND",
            message=f"{resource} '{identifier}' not found.",
            request_id=request_id,
        )


class ConflictException(PlatformException):
    def __init__(self, message: str, request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_409_CONFLICT,
            code="RESOURCE_CONFLICT",
            message=message,
            request_id=request_id,
        )


class RateLimitException(PlatformException):
    def __init__(self, retry_after: int = 60, request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            code="RATE_LIMIT_EXCEEDED",
            message=f"Rate limit exceeded. Please retry after {retry_after} seconds.",
            details=[{"retry_after": retry_after}],
            request_id=request_id,
        )


class InfrastructureException(PlatformException):
    def __init__(self, system_name: str, message: str, request_id: Optional[str] = None):
        super().__init__(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            code="INFRASTRUCTURE_UNAVAILABLE",
            message=f"Underlying system '{system_name}' is temporarily unavailable: {message}",
            request_id=request_id,
        )


class DatabaseConnectionException(InfrastructureException):
    def __init__(self, message: str = "Unable to connect to MongoDB datastore. Fail-closed enforced.", request_id: Optional[str] = None):
        super().__init__(system_name="MongoDB", message=message, request_id=request_id)

