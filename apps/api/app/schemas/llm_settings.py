from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

LlmProviderId = Literal["openai", "anthropic", "google", "deepseek", "openrouter", "ollama"]
LlmSettingsStatus = Literal["ready", "not_configured", "invalid", "expired", "unavailable"]
LlmMode = Literal["llm", "deterministic"]


class ActiveLlmSettings(BaseModel):
    provider: LlmProviderId | None = None
    providerLabel: str | None = None
    model: str | None = None
    hasKey: bool = False
    status: LlmSettingsStatus = "not_configured"
    lastValidatedAt: datetime | None = None
    lastUsedAt: datetime | None = None
    mode: LlmMode = "deterministic"
    requiresConfirmation: bool = True
    reason: str


class SelectLlmProviderRequest(BaseModel):
    provider: str
    model: str | None = None


class ConfirmLlmUseRequest(BaseModel):
    requestedCapability: str = Field(min_length=1, max_length=80)
    workspaceId: str | None = Field(default=None, max_length=120)
    mode: LlmMode = "llm"
    optionalOverrideProvider: str | None = None


class LlmResolution(BaseModel):
    provider: LlmProviderId | None = None
    providerLabel: str | None = None
    model: str | None = None
    mode: LlmMode
    reason: str
    fallbackUsed: bool
    keyStatus: LlmSettingsStatus
    requestedCapability: str


class LlmCacheStats(BaseModel):
    """Real counters already tracked by the process-local LLM response cache
    (app/engines/llm/response_cache.py via Prometheus Counter/Gauge) -- no
    tokens/cost/most-used-model fields, since none of that is tracked
    anywhere in this codebase."""

    hits: int
    misses: int
    stored: int
    evicted: int
    expired: int
    oversized: int
    entries: int
    bytes: int
