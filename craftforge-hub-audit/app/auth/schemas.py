from pydantic import BaseModel, Field, EmailStr, ConfigDict
from typing import Optional
from datetime import datetime


class RegisterRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=8)

class LoginRequest(BaseModel):
    username: str
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str
    plan: str
    created_at: datetime

class ErrorResponse(BaseModel):
    detail: str
    correlation_id: str = ""

class Forbidden(ErrorResponse):
    pass

class NotFound(ErrorResponse):
    pass

class Unauthorized(ErrorResponse):
    pass

class InternalServerError(ErrorResponse):
    pass

class RateLimit(ErrorResponse):
    pass

class ValidationError(ErrorResponse):
    pass

class ValidationErrorItem(BaseModel):
    loc: list
    msg: str
    type: str