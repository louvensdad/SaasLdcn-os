from __future__ import annotations

from typing import Any

# Model capability + cost registry for the multi-LLM router.
#
# Anthropic IDs and prices below are verified against the official Claude API
# reference (claude-api skill, cached 2026-06-04). OpenAI / Google entries are
# placeholders — CONFIRM exact model IDs and pricing in each provider's console
# before enabling them in production.
#
# Key field: `supports_temperature`. Opus 4.8 / 4.7 and Fable 5 REJECT
# temperature/top_p/top_k with HTTP 400 — the router must never forward them.

MODEL_REGISTRY: dict[str, dict[str, Any]] = {
    # --- Anthropic (verified) ---
    "claude-opus-4-8": {
        "provider": "anthropic",
        "ctx": 1_000_000,
        "max_out": 128_000,
        "in_per_mtok": 5.0,
        "out_per_mtok": 25.0,
        "supports_temperature": False,
    },
    "claude-sonnet-4-6": {
        "provider": "anthropic",
        "ctx": 1_000_000,
        "max_out": 64_000,
        "in_per_mtok": 3.0,
        "out_per_mtok": 15.0,
        "supports_temperature": False,
    },
    "claude-haiku-4-5": {
        "provider": "anthropic",
        "ctx": 200_000,
        "max_out": 64_000,
        "in_per_mtok": 1.0,
        "out_per_mtok": 5.0,
        "supports_temperature": False,
    },
    "claude-fable-5": {
        "provider": "anthropic",
        "ctx": 1_000_000,
        "max_out": 128_000,
        "in_per_mtok": 10.0,
        "out_per_mtok": 50.0,
        "supports_temperature": False,
        "always_thinking": True,
        "needs_30d_retention": True,
    },
    # --- OpenAI (CONFIRM exact IDs + pricing in the OpenAI console) ---
    "gpt-4.1": {
        "provider": "openai",
        "supports_temperature": True,
    },
    "o4-mini": {
        "provider": "openai",
        "reasoning": True,
        "supports_temperature": False,  # o-series rejects temperature; uses reasoning_effort
    },
    # --- Google Gemini (CONFIRM exact IDs + pricing in the Google AI Studio) ---
    "gemini-2.5-pro": {
        "provider": "google",
        "supports_temperature": True,
    },
    "gemini-2.5-flash": {
        "provider": "google",
        "supports_temperature": True,
    },
}

DEFAULT_MODEL = "claude-opus-4-8"

# Cost-aware auto-selection by agent role, used when the user does not pick a model.
ROLE_MODEL_HINTS: dict[str, str] = {
    "orchestrator": "claude-sonnet-4-6",
    "contracts": "claude-opus-4-8",
    "backend": "claude-opus-4-8",
    "frontend": "claude-opus-4-8",
    "qa": "claude-sonnet-4-6",
    "devops": "claude-sonnet-4-6",
    "docs": "claude-haiku-4-5",
}


def resolve_model(user_choice: str | None = None, agent_role: str | None = None) -> str:
    if user_choice and user_choice in MODEL_REGISTRY:
        return user_choice
    if agent_role and ROLE_MODEL_HINTS.get(agent_role) in MODEL_REGISTRY:
        return ROLE_MODEL_HINTS[agent_role]
    return DEFAULT_MODEL
