from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import Any

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core import rate_limit as rate_limit_module
from app.core.config import get_settings
from app.core.rate_limit import (
    InMemoryBackend,
    RateLimitBackendUnavailable,
    RateLimitDecision,
    RateLimitMiddleware,
    RedisBackend,
)


class SharedRedisScriptFake:
    """Minimal shared Redis model for the atomic Lua contract."""

    def __init__(self) -> None:
        self.entries: dict[str, list[int]] = defaultdict(list)

    async def eval(self, _script: str, _keys: int, key: str, now: int, window: int, limit: int, _member: str) -> list[int]:
        active = [timestamp for timestamp in self.entries[key] if timestamp > now - window]
        self.entries[key] = active
        if len(active) >= int(limit):
            retry = max(1, int(window) - (int(now) - active[0]))
            return [0, retry]
        active.append(int(now))
        return [1, 0]


class BrokenRedisFake:
    async def eval(self, *_args: Any) -> list[int]:
        raise ConnectionError("redis offline")


def test_in_memory_backend_enforces_sliding_window(monkeypatch):
    values = iter([100.0, 101.0, 102.0, 161.1])
    backend = InMemoryBackend(clock=lambda: next(values))

    assert asyncio.run(backend.is_allowed("key", 2, 60)).allowed is True
    assert asyncio.run(backend.is_allowed("key", 2, 60)).allowed is True
    blocked = asyncio.run(backend.is_allowed("key", 2, 60))
    assert blocked.allowed is False
    assert blocked.retry_after == 58
    assert asyncio.run(backend.is_allowed("key", 2, 60)).allowed is True


def test_two_redis_backend_instances_share_one_limit(monkeypatch):
    shared = SharedRedisScriptFake()
    first = RedisBackend("redis://unused", client=shared)
    second = RedisBackend("redis://unused", client=shared)
    first._clock = lambda: 1_000.0
    second._clock = lambda: 1_000.0

    assert asyncio.run(first.is_allowed("rl:user:one:generation", 2, 60)).allowed is True
    assert asyncio.run(second.is_allowed("rl:user:one:generation", 2, 60)).allowed is True
    decision = asyncio.run(first.is_allowed("rl:user:one:generation", 2, 60))

    assert decision.allowed is False
    assert decision.retry_after == 60


def test_redis_backend_does_not_silently_fallback():
    backend = RedisBackend("redis://unused", client=BrokenRedisFake())
    try:
        asyncio.run(backend.is_allowed("key", 1, 60))
    except RateLimitBackendUnavailable:
        pass
    else:
        raise AssertionError("Redis failure must fail closed")


def test_middleware_returns_structured_503_when_redis_is_unavailable(monkeypatch):
    class BrokenBackend:
        async def is_allowed(self, _key: str, _limit: int, _window: int) -> RateLimitDecision:
            raise RateLimitBackendUnavailable("offline")

    settings = get_settings()
    previous_enabled = settings.rate_limit_enabled
    previous_redis_url = settings.redis_url
    settings.rate_limit_enabled = True
    settings.redis_url = "redis://configured-but-offline"
    monkeypatch.setattr(rate_limit_module, "_build_backend", lambda _settings: BrokenBackend())

    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)

    @app.get("/api/example")
    def example() -> dict[str, bool]:
        return {"ok": True}

    try:
        with TestClient(app) as client:
            response = client.get("/api/example")
    finally:
        settings.rate_limit_enabled = previous_enabled
        settings.redis_url = previous_redis_url

    assert response.status_code == 503
    assert response.headers["Retry-After"] == "5"
    assert response.json()["error"]["code"] == "rate_limit_backend_unavailable"