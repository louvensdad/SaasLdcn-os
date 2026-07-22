from __future__ import annotations

from dataclasses import dataclass
from typing import Any

# Model capability + cost registry for the multi-LLM router.
#
# Anthropic IDs and prices below are verified against the official Claude API
# reference (claude-api skill, cached 2026-06-04). OpenAI / Google entries are
# placeholders â€” CONFIRM exact model IDs and pricing in each provider's console
# before enabling them in production.
#
# Key field: `supports_temperature`. Opus 4.8 / 4.7 and Fable 5 REJECT
# temperature/top_p/top_k with HTTP 400 â€” the router must never forward them.

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
    # selected explicitly from the UI, never auto-routed. Quality is below the
    # cloud frontier models but produces real, usable output without any key.
    # credit. Selected explicitly from the UI; never auto-routed.
    # --- DeepSeek V4 (first-class API; one DeepSeek key) ---
    "deepseek-v4-flash": {"provider": "deepseek", "supports_temperature": True},
    "deepseek-v4-pro": {"provider": "deepseek", "reasoning": True, "supports_temperature": False},
    # --- Groq (cloud inference, BYOK; free tier exists but pricing varies by
    # model/plan -- $0 placeholder here until real per-token pricing is confirmed,
    # same anti-fabrication rule as everywhere else in this registry) ---
    "llama-3.3-70b-versatile": {
        "provider": "groq",
        "supports_temperature": True,
        "in_per_mtok": 0.0,
        "out_per_mtok": 0.0,
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
    "reviewer": "claude-sonnet-4-6",
    "repair": "claude-opus-4-8",
}


# Execution Profiles (Economy/Professional/Enterprise) model strategy: an
# explicit per-role override, consulted AFTER an explicit user_choice (which
# always wins -- BYOK/explicit picks are never second-guessed) but BEFORE the
# generic ROLE_MODEL_HINTS default. "balanced" is intentionally absent: it IS
# today's existing ROLE_MODEL_HINTS, unchanged, so a job with no profile (or
# Professional) behaves exactly as it always has.
PROFILE_MODEL_OVERRIDES: dict[str, dict[str, str]] = {
    "economy": {
        "orchestrator": "claude-haiku-4-5",
        "contracts": "claude-sonnet-4-6",
        "backend": "claude-sonnet-4-6",
        "frontend": "claude-sonnet-4-6",
        "qa": "claude-haiku-4-5",
        "devops": "claude-haiku-4-5",
        "docs": "claude-haiku-4-5",
        "reviewer": "claude-haiku-4-5",
        "repair": "claude-sonnet-4-6",
    },
    "premium": {
        "orchestrator": "claude-opus-4-8",
        "contracts": "claude-opus-4-8",
        "backend": "claude-opus-4-8",
        "frontend": "claude-opus-4-8",
        "reviewer": "claude-opus-4-8",
        "repair": "claude-opus-4-8",
    },
}


@dataclass(frozen=True)
class ModelResolution:
    """Real output of the routing decision (AI decision-observability, vault
    65 - Observabilidade de IA): not just the winning model, but WHICH rule
    fired and what the other real candidates were -- so a decision trace can
    later explain "why this model" without guessing."""

    model: str
    policy: str  # "user_choice" | "profile_override" | "role_hint" | "default"
    alternatives: list[dict[str, str]]  # [{"policy": ..., "model": ...}, ...] -- real losing candidates, never invented


def resolve_model_detailed(
    user_choice: str | None = None, agent_role: str | None = None, model_strategy: str | None = None,
) -> ModelResolution:
    profile_candidate = None
    overrides = PROFILE_MODEL_OVERRIDES.get(model_strategy or "")
    if overrides and agent_role and overrides.get(agent_role) in MODEL_REGISTRY:
        profile_candidate = overrides[agent_role]
    role_candidate = None
    if agent_role and ROLE_MODEL_HINTS.get(agent_role) in MODEL_REGISTRY:
        role_candidate = ROLE_MODEL_HINTS[agent_role]

    if user_choice and user_choice in MODEL_REGISTRY:
        alternatives = [
            {"policy": policy, "model": candidate}
            for policy, candidate in (
                ("profile_override", profile_candidate),
                ("role_hint", role_candidate),
                ("default", DEFAULT_MODEL),
            )
            if candidate and candidate != user_choice
        ]
        return ModelResolution(model=user_choice, policy="user_choice", alternatives=alternatives)

    if profile_candidate:
        alternatives = [
            {"policy": policy, "model": candidate}
            for policy, candidate in (("role_hint", role_candidate), ("default", DEFAULT_MODEL))
            if candidate and candidate != profile_candidate
        ]
        return ModelResolution(model=profile_candidate, policy="profile_override", alternatives=alternatives)

    if role_candidate:
        alternatives = [{"policy": "default", "model": DEFAULT_MODEL}] if DEFAULT_MODEL != role_candidate else []
        return ModelResolution(model=role_candidate, policy="role_hint", alternatives=alternatives)

    return ModelResolution(model=DEFAULT_MODEL, policy="default", alternatives=[])


def resolve_model(
    user_choice: str | None = None, agent_role: str | None = None, model_strategy: str | None = None,
) -> str:
    return resolve_model_detailed(user_choice=user_choice, agent_role=agent_role, model_strategy=model_strategy).model


# Token Intelligence cost ladder (Engineering Policy gap #7): cheapest first,
# escalate only on failure. Scoped ONLY to the build-failure repair loop
# (verification_engine.py's iter_verification, round_no=0 is the first repair
# attempt) -- that loop already re-validates every attempt with a REAL build,
# so a bad cheap-model fix simply fails validation and the next round
# escalates; the existing revalidation is the safety net. Deliberately NOT
# applied to primary generation roles (backend/frontend/contracts) or to
# llm_repair_engine.py's single-shot Quality Gate repair (no internal
# revalidation-per-round loop to escalate against) -- changing those without a
# revalidation safety net would be an unvalidated quality risk, not a proven
# optimization.
REPAIR_LADDER_FIRST_ATTEMPT_MODEL = "claude-haiku-4-5"


def resolve_repair_round_model(user_choice: str | None, round_no: int) -> str | None:
    """None means 'no override' -- resolve_model() falls through to
    ROLE_MODEL_HINTS["repair"] (claude-opus-4-8) as it always has."""
    if user_choice:
        return user_choice
    if round_no == 0:
        return REPAIR_LADDER_FIRST_ATTEMPT_MODEL
    return None
