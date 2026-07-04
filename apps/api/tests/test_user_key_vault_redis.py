from __future__ import annotations

from typing import Any

import pytest

from app.core.config import get_settings
from app.services.user_key_session_service import (
    RedisVaultBackend,
    UserKeySessionService,
    UserKeyVaultUnavailable,
    user_key_session,
)

RAW_KEY = "sk-shared-secret-123456"


class SharedRedisFake:
    def __init__(self) -> None:
        self.now = 1_000.0
        self.values: dict[str, tuple[str, float]] = {}

    def setex(self, key: str, ttl: int, value: str) -> None:
        self.values[key] = (value, self.now + ttl)

    def get(self, key: str) -> str | None:
        entry = self.values.get(key)
        if entry is None:
            return None
        if entry[1] <= self.now:
            self.values.pop(key, None)
            return None
        return entry[0]

    def mget(self, keys: list[str]) -> list[str | None]:
        return [self.get(key) for key in keys]

    def ttl(self, key: str) -> int:
        entry = self.values.get(key)
        if entry is None or entry[1] <= self.now:
            return -2
        return int(entry[1] - self.now)

    def delete(self, *keys: str) -> int:
        deleted = 0
        for key in keys:
            deleted += int(self.values.pop(key, None) is not None)
        return deleted


class BrokenRedisFake:
    def setex(self, *_args: Any) -> None:
        raise ConnectionError("redis offline")

    def get(self, *_args: Any) -> None:
        raise ConnectionError("redis offline")

    def mget(self, *_args: Any) -> None:
        raise ConnectionError("redis offline")

    def delete(self, *_args: Any) -> None:
        raise ConnectionError("redis offline")


def test_key_persists_between_two_service_instances_without_plaintext_storage():
    shared = SharedRedisFake()
    first = UserKeySessionService(RedisVaultBackend("redis://unused", client=shared))
    second = UserKeySessionService(RedisVaultBackend("redis://unused", client=shared))

    masked = first.set("user-a", "openai", RAW_KEY)

    stored_payload = shared.values["vault:user-a:openai"][0]
    assert RAW_KEY not in stored_payload
    assert second.get("user-a", "openai") == RAW_KEY
    expires = get_settings().user_key_ttl_seconds
    assert second.status("user-a") == [("openai", masked, expires)]

    second.clear("user-a", "openai")
    assert first.get("user-a", "openai") is None


def test_redis_ttl_expires_key_for_every_instance():
    settings = get_settings()
    previous_ttl = settings.user_key_ttl_seconds
    settings.user_key_ttl_seconds = 2
    shared = SharedRedisFake()
    first = UserKeySessionService(RedisVaultBackend("redis://unused", client=shared))
    second = UserKeySessionService(RedisVaultBackend("redis://unused", client=shared))
    try:
        first.set("user-a", "anthropic", RAW_KEY)
        shared.now += 2.1
        assert second.get("user-a", "anthropic") is None
        assert second.status("user-a") == []
    finally:
        settings.user_key_ttl_seconds = previous_ttl


def test_configured_redis_failure_never_falls_back_to_process_memory():
    service = UserKeySessionService(RedisVaultBackend("redis://unused", client=BrokenRedisFake()))
    with pytest.raises(UserKeyVaultUnavailable):
        service.set("user-a", "openai", RAW_KEY)


def test_http_returns_structured_503_when_vault_redis_is_unavailable(client):
    previous_backend = user_key_session._backend
    previous_managed = user_key_session._managed_backend
    previous_url = user_key_session._backend_url
    user_key_session._backend = RedisVaultBackend("redis://unused", client=BrokenRedisFake())
    user_key_session._managed_backend = False
    try:
        response = client.post(
            "/api/user-ai-keys/session",
            json={"provider": "openai", "api_key": RAW_KEY},
        )
    finally:
        user_key_session._backend = previous_backend
        user_key_session._managed_backend = previous_managed
        user_key_session._backend_url = previous_url

    assert response.status_code == 503
    assert response.headers["Retry-After"] == "5"
    assert response.json()["error"]["code"] == "user_key_vault_unavailable"
    assert RAW_KEY not in response.text