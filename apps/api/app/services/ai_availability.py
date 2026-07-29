from __future__ import annotations

import os

from app.core.config import get_settings

# Detects whether a REAL LLM provider is configured server-side, so the platform
# can default to AI instead of the deterministic fallback — and tell the user which
# mode they are in (honest "Modo IA Real" vs "Preview Determinístico").
#
# config does not mean a local server is actually running, so counting it would
# produce a false "AI active".

_CLOUD_KEY_ENV = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "google": "GOOGLE_API_KEY",
    "deepseek": "DEEPSEEK_API_KEY",
    "groq": "GROQ_API_KEY",
}


def available_providers() -> list[str]:
    """Providers reachable with server-side configuration (no user key required)."""
    if get_settings().force_mock:
        return []
    providers = [name for name, env in _CLOUD_KEY_ENV.items() if os.environ.get(env, "").strip()]
    return providers


def ai_available() -> bool:
    """True when a real provider can serve the request by default (server-side)."""
    return bool(available_providers())


def ai_status() -> dict:
    providers = available_providers()
    active = bool(providers)
    return {
        "ai_active": active,
        "mode": "ai" if active else "deterministic_preview",
        "providers": providers,
    }
