from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class RegisterRequest(BaseModel):
    email: EmailStr
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        """Validate password complexity: at least one uppercase, one lowercase, one digit."""
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class RefreshRequest(BaseModel):
    refresh_token: str


class CreateAccountRequest(BaseModel):
    game: str
    username: str
    password: str = Field(..., min_length=1)  # game account password, not app password
    notes: Optional[str] = None


class UpdateAccountRequest(BaseModel):
    game: Optional[str] = None
    username: Optional[str] = None
    password: Optional[str] = None
    notes: Optional[str] = None


class CreateMacroRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    script_content: str = Field(..., min_length=1)
    language: str = "python"


class UpdateMacroRequest(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    script_content: Optional[str] = None
    language: Optional[str] = None


class AccountResponse(BaseModel):
    id: str
    game: str
    username: str
    notes: Optional[str]
    user_id: str
    created_at: str
    updated_at: str


class InstanceResponse(BaseModel):
    id: str
    account_id: str
    status: str  # online, offline, starting, stopping
    fps: Optional[float]
    ram_usage_mb: Optional[float]
    started_at: Optional[str]
    stopped_at: Optional[str]


class MacroResponse(BaseModel):
    id: str
    name: str
    description: Optional[str]
    script_content: str
    language: str
    user_id: str
    created_at: str
    updated_at: str


class ExecutionLogResponse(BaseModel):
    id: str
    macro_id: str
    instance_id: str
    result: str  # success, failure
    output: Optional[str]
    started_at: str
    finished_at: Optional[str]


class UserAdminResponse(BaseModel):
    id: str
    email: str
    username: str
    role: str
    plan: str
    is_active: bool
    created_at: str
    updated_at: str