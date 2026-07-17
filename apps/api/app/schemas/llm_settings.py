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
    # Real context-window size (tokens) of the active model, straight from
    # MODEL_REGISTRY's `ctx`; None when the model isn't in the registry.
    contextTokens: int | None = None


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
    (app/engines/llm/response_cache.py via Prometheus Counter/Gauge). Token/
    cost telemetry lives separately in LlmUsageStats (llm_usage_records)."""

    hits: int
    misses: int
    stored: int
    evicted: int
    expired: int
    oversized: int
    entries: int
    bytes: int


class LlmUsageBucket(BaseModel):
    hour: str
    requests: int
    tokens: int
    avg_latency_ms: float
    cost_usd: float


class LlmUsageWindowTotals(BaseModel):
    requests: int
    input_tokens: int
    output_tokens: int
    cache_read_tokens: int
    saved_tokens: int
    avg_latency_ms: float | None = None
    estimated_cost_usd: float
    cache_savings_usd: float


class LlmUsageStats(LlmUsageWindowTotals):
    """Real per-call telemetry recorded by the router (llm_usage_records):
    provider-reported token counts, wall-clock latency, registry-priced cost.
    `previous` covers the window immediately before, for honest deltas."""

    window_hours: int
    previous: LlmUsageWindowTotals
    buckets: list[LlmUsageBucket]


class LlmModelUsage(BaseModel):
    """One real model's usage in the window -- a model with zero calls simply
    doesn't appear, rather than being padded with fabricated zeros. `provider`
    is a plain string (not the LlmProviderId literal): it echoes whatever the
    router actually recorded, including the deterministic/mock fallback."""

    model: str
    provider: str
    requests: int
    avg_latency_ms: float | None = None
    estimated_cost_usd: float
    cache_hit_rate: float
