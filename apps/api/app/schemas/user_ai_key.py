from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

KeyProvider = Literal["openai", "anthropic", "google", "deepseek", "groq"]


class CreateAiKeyRequest(ApiModel):
    provider: KeyProvider
    nome: str = Field(min_length=1, max_length=120)
    # The raw key travels here over HTTPS, is encrypted at rest, and is NEVER
    # echoed back in any response after creation.
    api_key: str = Field(min_length=8, repr=False)
    apelido: str | None = Field(default=None, max_length=120)
    modelo_padrao: str | None = None


class UpdateAiKeyRequest(ApiModel):
    nome: str | None = Field(default=None, min_length=1, max_length=120)
    apelido: str | None = Field(default=None, max_length=120)
    modelo_padrao: str | None = None
    ativo: bool | None = None


class AiKeyView(ApiModel):
    id: str
    provider: str
    nome: str
    apelido: str | None = None
    masked: str
    modelo_padrao: str | None = None
    status: Literal["untested", "valid", "invalid", "unavailable"]
    ativo: bool
    is_default: bool
    created_at: str
    last_used_at: str | None = None
    last_validated_at: str | None = None


class AiKeyListResponse(ApiModel):
    keys: list[AiKeyView] = Field(default_factory=list)


class TestKeyRequest(ApiModel):
    provider: KeyProvider
    api_key: str = Field(min_length=8, repr=False)


class TestKeyResponse(ApiModel):
    ok: bool
    provider: str
    model: str | None = None
    http_status: int
    message: str
    latency_ms: int | None = None
    validated_at: str | None = None
