from __future__ import annotations

import threading

from app.core.security import decrypt_secret, encrypt_secret
from app.data.model_registry import DEFAULT_MODEL, MODEL_REGISTRY

# Ephemeral, in-memory vault for user-owned LLM API keys (User Key Boost).
#
# Security posture (the key is the most sensitive datum in the request):
# - RAM only. Never written to disk/DB/log. Lost on process restart by design.
# - Encrypted in memory with Fernet (encrypt_secret) — defense in depth so the
#   plaintext key is not sitting in a dict; it is decrypted only at the instant a
#   provider client is built, in the adapter.
# - Isolated per user_id. Cleared explicitly (DELETE endpoint) and on logout.
# - Responses only ever expose a masked tail, never the raw key.

_PROVIDERS = {"anthropic", "openai", "google"}


def mask_key(raw: str) -> str:
    """Return a non-reversible display tail, e.g. '****cdef'. Never the full key."""
    tail = raw[-4:] if len(raw) >= 4 else ""
    return f"••••{tail}"


class UserKeySessionService:
    def __init__(self) -> None:
        # user_id -> provider -> (fernet_token, masked_tail)
        self._vault: dict[str, dict[str, tuple[str, str]]] = {}
        self._lock = threading.Lock()

    def set(self, user_id: str, provider: str, api_key: str) -> str:
        provider = provider.strip().lower()
        if provider not in _PROVIDERS:
            raise ValueError(f"Unsupported provider '{provider}'.")
        api_key = api_key.strip()
        if not api_key:
            raise ValueError("API key must not be empty.")
        masked = mask_key(api_key)
        token = encrypt_secret(api_key)  # encrypted at rest in RAM
        with self._lock:
            self._vault.setdefault(user_id, {})[provider] = (token, masked)
        return masked

    def get(self, user_id: str, provider: str) -> str | None:
        """Return the plaintext key for use at client-build time, or None."""
        with self._lock:
            entry = self._vault.get(user_id, {}).get(provider.strip().lower())
        if entry is None:
            return None
        return decrypt_secret(entry[0])

    def status(self, user_id: str) -> list[tuple[str, str]]:
        """List (provider, masked_tail) for the user's active key sessions."""
        with self._lock:
            return [(provider, masked) for provider, (_token, masked) in sorted(self._vault.get(user_id, {}).items())]

    def resolve_for_model_choice(self, user_id: str, user_model_choice: str | None) -> str | None:
        """Return the user's key for the provider of the effective model.

        The factory pins every agent to one provider (an explicit user_model_choice
        wins for all roles; otherwise the default-role hints are all the same
        provider), so a single key per run is correct.
        """
        model = user_model_choice if (user_model_choice and user_model_choice in MODEL_REGISTRY) else DEFAULT_MODEL
        provider = MODEL_REGISTRY[model]["provider"]
        return self.get(user_id, provider)

    def clear(self, user_id: str, provider: str | None = None) -> None:
        with self._lock:
            if provider is None:
                self._vault.pop(user_id, None)
                return
            user_keys = self._vault.get(user_id)
            if user_keys is not None:
                user_keys.pop(provider.strip().lower(), None)
                if not user_keys:
                    self._vault.pop(user_id, None)


user_key_session = UserKeySessionService()
