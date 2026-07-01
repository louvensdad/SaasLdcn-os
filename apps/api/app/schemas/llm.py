from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Provider(str, Enum):
    anthropic = "anthropic"
    openai = "openai"
    google = "google"
    ollama = "ollama"  # local, key-free generation via an OpenAI-compatible endpoint
    openrouter = "openrouter"  # online aggregator (many models, one key) via OpenAI-compatible API
    deepseek = "deepseek"  # DeepSeek first-class API (deepseek-chat / deepseek-reasoner)
    custom = "custom"  # any user-configured OpenAI-compatible endpoint (vLLM, LM Studio, Together, ...)


class ReasoningLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"
    max = "max"


class LLMRequest(BaseModel):
    """Provider-neutral request. Each adapter translates this into the exact
    parameters its provider accepts.

    Note: `creativity` is intentionally neutral. The Anthropic adapter IGNORES it
    because temperature/top_p/top_k return HTTP 400 on Opus 4.8 / Fable 5. The
    OpenAI/Google adapters map it to `temperature`. This is the core of why a
    shared parameter blob cannot work across providers (diagnosis error #2).
    """

    system: str  # the agent's instructions (stable -> cacheable prefix)
    user: str  # the compiled Mega-Prompt / context (volatile suffix)
    reasoning: ReasoningLevel = ReasoningLevel.high
    creativity: float = 0.2  # 0..1 neutral; consumed only by providers that accept temperature
    max_output_tokens: int = 16000
    json_schema: dict | None = None  # if set, forces structured output
    cache_prefix: bool = True  # apply cache_control to the stable system prefix
    timeout_ms: int | None = None  # per-request hard timeout; None = provider default


class LLMResponse(BaseModel):
    provider: Provider
    model: str
    text: str
    parsed: dict | None = None
    stopped_by: str = ""  # end_turn | max_tokens | refusal | tool_use | ...
    usage: dict = Field(default_factory=dict)  # input/output/cache token counts
    served_by_fallback: bool = False
