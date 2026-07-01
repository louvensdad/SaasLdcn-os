from __future__ import annotations

import time
from collections import deque
from collections.abc import Awaitable, Callable

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import Settings, get_settings
from app.core.security import TokenError, decode_token


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding-window rate limiter.

    Disabled unless `settings.rate_limit_enabled` (true only when
    LDCN_ENVIRONMENT=production by default), so local development and the
    test suite -- which issues many rapid `/api/auth/register` calls from
    `tests/conftest.py` across dozens of test files -- are unaffected.

    Three buckets with separate limits (diagnosis M5):
      - ``auth``: tight, to slow credential-stuffing / brute-force.
      - ``generation``: tightest, because each generation request triggers several
        multi-minute (paid) LLM calls — without this a single account could run up
        cost. Keyed per authenticated user, not per IP, so one user behind a shared
        NAT cannot exhaust everyone else's quota (and vice versa).
      - ``default``: everything else.

    Client identity prefers the authenticated user id (from a best-effort token
    decode); otherwise the client IP. The IP is taken from the first hop of
    X-Forwarded-For ONLY when ``settings.trust_proxy_headers`` is set (i.e. the app
    sits behind a trusted proxy that sets it); otherwise the raw socket peer is used,
    so the header cannot be spoofed in a direct-connect deployment.

    This limiter is process-local and resets on restart; a multi-instance deployment
    should replace it with a shared store (e.g. Redis).
    """

    _WINDOW_SECONDS = 60.0

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._hits: dict[str, deque[float]] = {}

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        bucket, limit = self._bucket(request, settings)
        identity = self._identity(request, settings)
        key = f"{identity}:{bucket}"

        now = time.monotonic()
        window_start = now - self._WINDOW_SECONDS
        hits = self._hits.setdefault(key, deque())
        while hits and hits[0] < window_start:
            hits.popleft()

        if len(hits) >= limit:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": {
                        "code": "rate_limited",
                        "message": "Too many requests. Please try again later.",
                        "details": [],
                    }
                },
                headers={"Retry-After": str(int(self._WINDOW_SECONDS))},
            )

        hits.append(now)
        return await call_next(request)

    def _bucket(self, request: Request, settings: Settings) -> tuple[str, int]:
        path = request.url.path
        prefix = settings.api_prefix
        if path.startswith(f"{prefix}/auth"):
            return "auth", settings.rate_limit_auth_per_minute
        # Generation endpoints fan out into several paid LLM calls; bucket them
        # tightly. They are the POST actions under meta-factory / modernize.
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
