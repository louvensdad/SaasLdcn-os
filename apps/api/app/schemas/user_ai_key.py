from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

KeyProvider = Literal["anthropic", "openai", "google", "openrouter", "deepseek", "custom"]

# User-chosen retention window for a stored key: 5 minutes to 90 days.
# None keeps the platform default (settings.user_key_ttl_seconds).
MIN_KEY_TTL_SECONDS = 300
MAX_KEY_TTL_SECONDS = 90 * 24 * 3600


class UpsertKeyRequest(ApiModel):
    provider: KeyProvider
    # The raw key travels here over HTTPS, is stored only in the encrypted ephemeral vault
    # vault, and is NEVER echoed back in any response.
    api_key: str = Field(min_length=8, repr=False)
    ttl_seconds: int | None = Field(default=None, ge=MIN_KEY_TTL_SECONDS, le=MAX_KEY_TTL_SECONDS)


class KeySessionStatus(ApiModel):
    provider: str
    masked: str
    active: bool = True
    expires_in_seconds: int | None = None


class KeySessionStatusResponse(ApiModel):
    sessions: list[KeySessionStatus] = Field(default_factory=list)


class TestKeyRequest(ApiModel):
    provider: KeyProvider
    api_key: str = Field(min_length=8, repr=False)


class TestKeyResponse(ApiModel):
    ok: bool
    provider: str
    model: str | None = None
    http_status: int
    message: str