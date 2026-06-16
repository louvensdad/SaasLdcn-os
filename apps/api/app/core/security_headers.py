from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.core.config import get_settings

# FastAPI's interactive docs (Swagger UI / ReDoc) load their JS/CSS from a CDN
# and render inline scripts/styles. A strict API CSP would break them, so
# those paths are exempted from the Content-Security-Policy header below.
_DOCS_PATHS = {"/docs", "/redoc", "/openapi.json"}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds a baseline set of OWASP-recommended security response headers.

    HSTS is only emitted when `settings.hsts_enabled` (production by default)
    since it is meaningless -- and potentially harmful -- for plain-HTTP
    local development.
    """

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        settings = get_settings()
        response = await call_next(request)

        if not settings.security_headers_enabled:
            return response

        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        response.headers.setdefault("Cross-Origin-Opener-Policy", "same-origin")

        if request.url.path not in _DOCS_PATHS:
            response.headers.setdefault("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")

        if settings.hsts_enabled:
            response.headers.setdefault(
                "Strict-Transport-Security",
                "max-age=63072000; includeSubDomains; preload",
            )
        return response
