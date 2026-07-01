from __future__ import annotations

import math
import time
from collections import deque
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any, Protocol
from uuid import uuid4

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import Settings, get_settings
from app.core.logging import logger
from app.core.security import TokenError, decode_token


@dataclass(frozen=True, slots=True)
class RateLimitDecision:
    allowed: bool
    retry_after: int = 0


class RateLimitBackend(Protocol):
    async def is_allowed(self, key: str, limit: int, window: int) -> RateLimitDecision: ...


class RateLimitBackendUnavailable(RuntimeError):
    pass


class InMemoryBackend:
    """Single-process fallback used only when Redis is not configured."""

    def __init__(self, *, clock: Callable[[], float] = time.monotonic) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._clock = clock

    async def is_allowed(self, key: str, limit: int, window: int) -> RateLimitDecision:
        now = self._clock()
        hits = self._hits.setdefault(key, deque())
        window_start = now - window
        while hits and hits[0] <= window_start:
            hits.popleft()
        if len(hits) >= limit:
            retry_after = max(1, math.ceil(window - (now - hits[0])))
            return RateLimitDecision(False, retry_after)
        hits.append(now)
        return RateLimitDecision(True)


_REDIS_SLIDING_WINDOW = """
local key = KEYS[1]
local now_ms = tonumber(ARGV[1])
local window_ms = tonumber(ARGV[2])
local limit = tonumber(ARGV[3])
local member = ARGV[4]

redis.call('ZREMRANGEBYSCORE', key, '-inf', now_ms - window_ms)
local count = redis.call('ZCARD', key)
if count >= limit then
    local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
    local retry_ms = window_ms
    if oldest[2] then
        retry_ms = math.max(1, window_ms - (now_ms - tonumber(oldest[2])))
    end
    redis.call('PEXPIRE', key, window_ms + 1000)
    return {0, retry_ms}
end

redis.call('ZADD', key, now_ms, member)
redis.call('PEXPIRE', key, window_ms + 1000)
return {1, 0}
"""


class RedisBackend:
    """Atomic distributed sliding window backed by a Redis sorted set."""

    def __init__(
        self,
        redis_url: str,
        *,
        client: Any | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        if client is None:
            import redis.asyncio as aioredis

            client = aioredis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
                health_check_interval=30,
            )
        self._redis = client
        self._clock = clock

    async def is_allowed(self, key: str, limit: int, window: int) -> RateLimitDecision:
        now_ms = int(self._clock() * 1000)
        window_ms = int(window * 1000)
        member = f"{now_ms}:{uuid4().hex}"
        try:
            result = await self._redis.eval(
                _REDIS_SLIDING_WINDOW,
                1,
                key,
                now_ms,
                window_ms,
                limit,
                member,
            )
        except Exception as exc:
            # Do not silently degrade to process-local state when Redis was
            # explicitly configured: that would make limits inconsistent again.
            raise RateLimitBackendUnavailable("Redis rate-limit backend is unavailable") from exc

        allowed = bool(int(result[0]))
        retry_after = max(0, math.ceil(int(result[1]) / 1000))
        return RateLimitDecision(allowed, retry_after)



def _build_backend(settings: Settings) -> RateLimitBackend:
    if settings.redis_url.strip():
        return RedisBackend(settings.redis_url.strip())
    return InMemoryBackend()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Per-user/IP sliding-window limiter with an optional shared Redis backend."""

    _WINDOW_SECONDS = 60

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._backend: RateLimitBackend | None = None

    def _get_backend(self) -> RateLimitBackend:
        if self._backend is None:
            self._backend = _build_backend(get_settings())
        return self._backend

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        bucket, limit = self._bucket(request, settings)
        identity = self._identity(request, settings)
        key = f"rl:{identity}:{bucket}"

        try:
            decision = await self._get_backend().is_allowed(
                key,
                limit,
                self._WINDOW_SECONDS,
            )
        except RateLimitBackendUnavailable:
            logger.exception("Distributed rate-limit backend unavailable")
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={
                    "error": {
                        "code": "rate_limit_backend_unavailable",
                        "message": "Request protection is temporarily unavailable.",
                        "details": [],
                    }
                },
                headers={"Retry-After": "5"},
            )

        if not decision.allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please try again later.",
                        "details": [],
                    }
                },
                headers={"Retry-After": str(decision.retry_after or self._WINDOW_SECONDS)},
            )
        return await call_next(request)

    def _bucket(self, request: Request, settings: Settings) -> tuple[str, int]:
        path = request.url.path
        prefix = settings.api_prefix
        if path.startswith(f"{prefix}/auth"):
            return "auth", settings.rate_limit_auth_per_minute
        if request.method == "POST" and (
            path.startswith(f"{prefix}/meta-factory") or path.startswith(f"{prefix}/modernize")
        ):
            return "generation", settings.rate_limit_generation_per_minute
        return "default", settings.rate_limit_default_per_minute

    @staticmethod
    def _identity(request: Request, settings: Settings) -> str:
        user_id = RateLimitMiddleware._user_id(request)
        if user_id is not None:
            return f"user:{user_id}"
        return f"ip:{RateLimitMiddleware._client_ip(request, settings)}"

    @staticmethod
    def _user_id(request: Request) -> str | None:
        header = request.headers.get("authorization", "")
        if not header.lower().startswith("bearer "):
            return None
        token = header[7:].strip()
        if not token:
            return None
        try:
            payload = decode_token(token, expected_type="access")
        except TokenError:
            return None
        sub = payload.get("sub")
        return str(sub) if sub else None

    @staticmethod
    def _client_ip(request: Request, settings: Settings) -> str:
        if settings.trust_proxy_headers:
            forwarded = request.headers.get("x-forwarded-for", "")
            first = forwarded.split(",")[0].strip()
            if first:
                return first
        return request.client.host if request.client else "unknown"