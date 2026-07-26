from pydantic import BaseModel, Field
from typing import Any, Optional, List


class ErrorResponse(BaseModel):
    """Standard error response body."""
    error: "ErrorDetail"


class ErrorDetail(BaseModel):
    code: str
    message: str
    correlation_id: Optional[str] = None
    details: Optional[List[Any]] = None


class ValidationErrorItem(BaseModel):
    loc: List[str]
    msg: str
    type: str


class ValidationError(BaseModel):
    """Validation error response."""
    detail: List[ValidationErrorItem]


class NotFound(BaseModel):
    detail: str = "Resource not found"


class Forbidden(BaseModel):
    detail: str = "Forbidden"


class Unauthorized(BaseModel):
    detail: str = "Unauthorized"


class RateLimit(BaseModel):
    detail: str = "Too Many Requests"


class InternalServerError(BaseModel):
    detail: str = "Internal server error"


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    plan: str
    is_active: bool
    created_at: str
    updated_at: str