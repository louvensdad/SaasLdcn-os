from fastapi import FastAPI, Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.rate_limit import RateLimiter, InMemoryRateLimiter, RedisRateLimiter
import uuid
import time
import logging

logger = logging.getLogger("app.middleware")


class CorrelationIdMiddleware(BaseHTTPMiddleware):
    """Adds a unique correlation ID to each request."""

    async def dispatch(self, request: Request, call_next):
        correlation_id = request.headers.get("X-Correlation-ID", str(uuid.uuid4()))
        request.state.correlation_id = correlation_id
        response: Response = await call_next(request)
        response.headers["X-Correlation-ID"] = correlation_id
        return response


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Logs each request in structured JSON format."""

    async def dispatch(self, request: Request, call_next):
        start_time = time.time()
        response = await call_next(request)
        duration = time.time() - start_time
        log_data = {
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration * 1000, 2),
            "correlation_id": getattr(request.state, "correlation_id", None),
            "client_ip": request.client.host if request.client else None,
        }
        logger.info("Request", extra={"http_request": log_data})
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Enforces rate limits per endpoint."""

    def __init__(self, app: FastAPI, limiter: RateLimiter):
        super().__init__(app)
        self.limiter = limiter

    async def dispatch(self, request: Request, call_next):
        if settings.rate_limit_enabled:
            # Derive client IP from X-Forwarded-For or remote addr
            forwarded = request.headers.get("X-Forwarded-For")
            if forwarded:
                client_ip = forwarded.split(",")[0].strip()
            else:
                client_ip = request.client.host if request.client else "127.0.0.1"

            # Determine rate limit key: endpoint path or auth route special
            path = request.url.path
            if path.startswith("/auth/"):
                limit = settings.rate_limit_auth
            else:
                limit = settings.rate_limit_default

            allowed, retry_after = await self.limiter.check(client_ip + ":" + path, limit)
            if not allowed:
                from app.core.exceptions import RateLimitException
                raise RateLimitException(f"Rate limit exceeded. Retry after {retry_after}s")
        response = await call_next(request)
        return response


def setup_middlewares(app: FastAPI):
    """Configure all middlewares for the FastAPI app."""
    # CORS
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Rate Limiter (choose implementation based on Redis availability)
    if settings.redis_url:
        from app.core.rate_limit import RedisRateLimiter
        limiter = RedisRateLimiter(settings.redis_url)
    else:
        limiter = InMemoryRateLimiter()
    app.add_middleware(RateLimitMiddleware, limiter=limiter)
    # Correlation ID
    app.add_middleware(CorrelationIdMiddleware)
    # Request Logging
    app.add_middleware(RequestLoggingMiddleware)