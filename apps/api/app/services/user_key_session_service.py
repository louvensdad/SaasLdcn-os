from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable
from typing import Any, Protocol

from app.core.config import get_settings
from app.core.exceptions import ServiceUnavailableError
from app.core.security import decrypt_secret, encrypt_secret
from app.data.model_registry import DEFAULT_MODEL, MODEL_REGISTRY

_PROVIDERS = frozenset({"anthropic", "openai", "google", "openrouter", "deepseek", "custom"})


def mask_key(raw: str) -> str:
    tail = raw[-4:] if len(raw) >= 4 else ""
    return f"\u2022\u2022\u2022\u2022{tail}"


class UserKeyVaultUnavailable(ServiceUnavailableError):
    def __init__(self) -> None:
        super().__init__(
            "user_key_vault_unavailable",
            "User key storage is temporarily unavailable.",
            retry_after=5,
        )


class UserKeyVaultBackend(Protocol):
    def set(self, user_id: str, provider: str, token: str, masked: str, ttl: int) -> None: ...
    def get(self, user_id: str, provider: str) -> tuple[str, str] | None: ...
    def status(self, user_id: str) -> list[tuple[str, str]]: ...
    def clear(self, user_id: str, provider: str | None = None) -> None: ...


class InMemoryVaultBackend:
    """Encrypted process-local fallback used only when Redis is not configured."""

    def __init__(self, *, clock: Callable[[], float] = time.time) -> None:
        self._vault: dict[str, dict[str, tuple[str, str, float]]] = {}
        self._lock = threading.RLock()
        self._clock = clock

    def set(self, user_id: str, provider: str, token: str, masked: str, ttl: int) -> None:
        with self._lock:
            self._vault.setdefault(user_id, {})[provider] = (
                token,
                masked,
                self._clock() + ttl,
            )

    def get(self, user_id: str, provider: str) -> tuple[str, str] | None:
        with self._lock:
            entry = self._vault.get(user_id, {}).get(provider)
            if entry is None:
                return None
            if entry[2] <= self._clock():
                self._purge_locked(user_id, provider)
                return None
            return entry[0], entry[1]

    def status(self, user_id: str) -> list[tuple[str, str]]:
        with self._lock:
            now = self._clock()
            entries = self._vault.get(user_id, {})
            for provider in [name for name, entry in entries.items() if entry[2] <= now]:
                self._purge_locked(user_id, provider)
            return [
                (provider, entry[1])
                for provider, entry in sorted(self._vault.get(user_id, {}).items())
            ]

    def clear(self, user_id: str, provider: str | None = None) -> None:
        with self._lock:
            if provider is None:
                self._vault.pop(user_id, None)
            else:
                self._purge_locked(user_id, provider)

    def clear_all_for_tests(self) -> None:
        with self._lock:
            self._vault.clear()

    def _purge_locked(self, user_id: str, provider: str) -> None:
        entries = self._vault.get(user_id)
        if entries is None:
            return
        entries.pop(provider, None)
        if not entries:
            self._vault.pop(user_id, None)


class RedisVaultBackend:
    """Encrypted shared vault with server-enforced TTL per user/provider key."""

    def __init__(self, redis_url: str, *, client: Any | None = None) -> None:
        if client is None:
            import redis

            client = redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )
        self._redis = client

    @staticmethod
    def _key(user_id: str, provider: str) -> str:
        return f"vault:{user_id}:{provider}"

    @staticmethod
    def _encode(token: str, masked: str) -> str:
        return json.dumps({"token": token, "masked": masked}, separators=(",", ":"))

    @staticmethod
    def _decode(raw: str) -> tuple[str, str]:
        payload = json.loads(raw)
        return str(payload["token"]), str(payload["masked"])

    def set(self, user_id: str, provider: str, token: str, masked: str, ttl: int) -> None:
        try:
            self._redis.setex(self._key(user_id, provider), ttl, self._encode(token, masked))
        except Exception as exc:
            raise UserKeyVaultUnavailable() from exc

    def get(self, user_id: str, provider: str) -> tuple[str, str] | None:
        try:
            raw = self._redis.get(self._key(user_id, provider))
            return self._decode(raw) if raw else None
        except UserKeyVaultUnavailable:
            raise
        except Exception as exc:
            raise UserKeyVaultUnavailable() from exc

    def status(self, user_id: str) -> list[tuple[str, str]]:
        providers = sorted(_PROVIDERS)
        try:
            values = self._redis.mget([self._key(user_id, provider) for provider in providers])
            return [
                (provider, self._decode(raw)[1])
                for provider, raw in zip(providers, values, strict=True)
                if raw
            ]
        except UserKeyVaultUnavailable:
            raise
        except Exception as exc:
            raise UserKeyVaultUnavailable() from exc

    def clear(self, user_id: str, provider: str | None = None) -> None:
        keys = (
            [self._key(user_id, provider)]
            if provider is not None
            else [self._key(user_id, item) for item in sorted(_PROVIDERS)]
        )
        try:
            self._redis.delete(*keys)
        except Exception as exc:
            raise UserKeyVaultUnavailable() from exc


class UserKeySessionService:
    """Encrypted user-key vault, distributed through Redis when configured."""

    def __init__(self, backend: UserKeyVaultBackend | None = None) -> None:
        self._backend = backend
        self._managed_backend = backend is None
        self._backend_url: str | None = None

    def _get_backend(self) -> UserKeyVaultBackend:
        if not self._managed_backend:
            assert self._backend is not None
            return self._backend
        redis_url = get_settings().redis_url.strip()
        if self._backend is None or self._backend_url != redis_url:
            self._backend = RedisVaultBackend(redis_url) if redis_url else InMemoryVaultBackend()
            self._backend_url = redis_url
        return self._backend

    @staticmethod
    def _ttl() -> int:
        return max(1, int(get_settings().user_key_ttl_seconds))

    @staticmethod
    def _provider(provider: str) -> str:
        normalized = provider.strip().lower()
        if normalized not in _PROVIDERS:
            raise ValueError(f"Unsupported provider '{normalized}'.")
        return normalized

    def set(self, user_id: str, provider: str, api_key: str) -> str:
        normalized = self._provider(provider)
        clean_key = api_key.strip()
        if not clean_key:
            raise ValueError("API key must not be empty.")
        masked = mask_key(clean_key)
        self._get_backend().set(
            user_id,
            normalized,
            encrypt_secret(clean_key),
            masked,
            self._ttl(),
        )
        return masked

    def get(self, user_id: str, provider: str) -> str | None:
        normalized = provider.strip().lower()
        if normalized not in _PROVIDERS:
            return None
        entry = self._get_backend().get(user_id, normalized)
        if entry is None:
            return None
        try:
            return decrypt_secret(entry[0])
        except Exception:
            # Encryption-key rotation invalidates old ephemeral sessions safely.
            self._get_backend().clear(user_id, normalized)
            return None

    def status(self, user_id: str) -> list[tuple[str, str]]:
        return self._get_backend().status(user_id)

    def clear(self, user_id: str, provider: str | None = None) -> None:
        normalized = provider.strip().lower() if provider is not None else None
        if normalized is not None and normalized not in _PROVIDERS:
            return
        self._get_backend().clear(user_id, normalized)

    def resolve_for_model_choice(self, user_id: str, user_model_choice: str | None) -> str | None:
        model = user_model_choice if (user_model_choice and user_model_choice in MODEL_REGISTRY) else DEFAULT_MODEL
        provider = MODEL_REGISTRY[model]["provider"]
        return self.get(user_id, provider)

    def reset_for_tests(self) -> None:
        backend = self._get_backend()
        if isinstance(backend, InMemoryVaultBackend):
            backend.clear_all_for_tests()


user_key_session = UserKeySessionService()