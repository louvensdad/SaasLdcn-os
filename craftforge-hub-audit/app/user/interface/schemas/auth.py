from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime
from app.user.domain.models import UserRole

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=8)

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class RefreshRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class UserResponse(BaseModel):
    id: int
    email: str
    username: str
    role: UserRole
    plan: str
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True