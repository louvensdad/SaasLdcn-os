from __future__ import annotations

import re
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.common import ApiModel
from app.schemas.localization import LocaleCode

UserRole = Literal["admin", "user"]

_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _normalize_email(value: str) -> str:
    value = value.strip().lower()
    if not _EMAIL_PATTERN.match(value):
        raise ValueError("Invalid email address.")
    if len(value) > 254:
        raise ValueError("Email address is too long.")
    return value


class UserRegisterRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    full_name: str = Field(min_length=1, max_length=120)
    locale: LocaleCode = "pt-BR"
    privacy_policy_accepted: bool

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)

    @field_validator("full_name")
    @classmethod
    def _validate_full_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("full_name cannot be empty.")
        return value


class UserLoginRequest(ApiModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=1, max_length=128)

    @field_validator("email")
    @classmethod
    def _validate_email(cls, value: str) -> str:
        return _normalize_email(value)


class RefreshRequest(ApiModel):
    refresh_token: str = Field(min_length=1)


class UserPublic(ApiModel):
    user_id: str
    email: str
    full_name: str
    role: UserRole
    locale: LocaleCode
    is_active: bool
    consent_accepted_at: str | None = None
    consent_policy_version: str | None = None
    created_at: str
    updated_at: str


class TokenResponse(ApiModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class AuthResponse(ApiModel):
    user: UserPublic
    tokens: TokenResponse


class UserUpdateRequest(ApiModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    locale: LocaleCode | None = None

    @field_validator("full_name")
    @classmethod
    def _validate_full_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("full_name cannot be empty.")
        return value


class PasswordChangeRequest(ApiModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class ConsentRequest(ApiModel):
    accepted: bool
    policy_version: str = Field(min_length=1, max_length=32)


class DataExportResponse(ApiModel):
    contractVersion: str
    exported_at: str
    user: UserPublic
    projects: list[dict]
    audit_events: list[dict]


class AccountDeletionResponse(ApiModel):
    message: str
    deleted_at: str
