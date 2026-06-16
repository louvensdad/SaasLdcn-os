from __future__ import annotations

import time
from collections import deque
from collections.abc import Awaitable, Callable

from fastapi import Request, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp

from app.core.config import get_settings


class RateLimitMiddleware(BaseHTTPMiddleware):
    """In-memory sliding-window rate limiter, keyed by client IP.

    Disabled unless `settings.rate_limit_enabled` (true only when
    LDCN_ENVIRONMENT=production by default), so local development and the
    test suite -- which issues many rapid `/api/auth/register` calls from
    `tests/conftest.py` across dozens of test files -- are unaffected.

    Auth endpoints get a tighter limit than the rest of the API to slow down
    credential-stuffing / brute-force attempts. This limiter is process-local
    and resets on restart; a multi-instance deployment should replace it with
    a shared store (e.g. Redis).
    """

    _WINDOW_SECONDS = 60.0

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)
        self._hits: dict[str, deque[float]] = {}

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        if not settings.rate_limit_enabled:
            return await call_next(request)

        path = request.url.path
        is_auth_route = path.startswith(f"{settings.api_prefix}/auth")
        limit = settings.rate_limit_auth_per_minute if is_auth_route else settings.rate_limit_default_per_minute

        client_ip = request.client.host if request.client else "unknown"
        bucket = "auth" if is_auth_route else "default"
        key = f"{client_ip}:{bucket}"

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
