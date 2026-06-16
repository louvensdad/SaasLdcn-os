from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

KeyProvider = Literal["anthropic", "openai", "google"]


class UpsertKeyRequest(ApiModel):
    provider: KeyProvider
    # The raw key travels here over HTTPS, is stored only in the ephemeral RAM
    # vault, and is NEVER echoed back in any response.
    api_key: str = Field(min_length=8, repr=False)


class KeySessionStatus(ApiModel):
    provider: str
    masked: str
    active: bool = True


class KeySessionStatusResponse(ApiModel):
    sessions: list[KeySessionStatus] = Field(default_factory=list)
