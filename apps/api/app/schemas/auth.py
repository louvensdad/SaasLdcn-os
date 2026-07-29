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
    is_2fa_enabled: bool = False
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


class SessionResponse(ApiModel):
    session_id: str
    ip_address: str | None = None
    device_label: str | None = None
    created_at: str
    last_seen_at: str
    is_current: bool


class TwoFactorEnrollResponse(ApiModel):
    secret: str
    otpauth_uri: str


class TwoFactorCodeRequest(ApiModel):
    code: str = Field(min_length=6, max_length=8)


class ActivityExportResponse(ApiModel):
    contractVersion: str
    exported_at: str
    user_id: str
    activity: list[dict]


# A resized (client-side) avatar as a data URL. Capped hard server-side; only
# common raster image types are accepted. `None` clears the avatar.
_AVATAR_DATA_URL_PATTERN = re.compile(r"^data:image/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=\s]+$")
_MAX_AVATAR_CHARS = 400_000  # ~300 KB of base64


class AvatarUpdateRequest(ApiModel):
    avatar_url: str | None = None

    @field_validator("avatar_url")
    @classmethod
    def _validate_avatar(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            return None
        if len(value) > _MAX_AVATAR_CHARS:
            raise ValueError("Avatar image is too large.")
        if not _AVATAR_DATA_URL_PATTERN.match(value):
            raise ValueError("Avatar must be a base64-encoded PNG, JPEG, WEBP or GIF data URL.")
        return value


class AvatarResponse(ApiModel):
    avatar_url: str | None = None
