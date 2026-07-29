from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response


logger = logging.getLogger("ldcn.api.errors")


class ServiceUnavailableError(RuntimeError):
    """Safe operational dependency failure exposed as a structured HTTP 503."""

    def __init__(self, code: str, message: str, *, retry_after: int = 5) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.retry_after = retry_after


def _build_error_payload(
    *,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
    detail: Any | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
        }
    }
    if detail is not None:
        payload["detail"] = detail
    return payload


def _http_message_and_detail(raw_detail: Any) -> tuple[str, Any | None]:
    if isinstance(raw_detail, str):
        return raw_detail, None
    if isinstance(raw_detail, dict):
        message = raw_detail.get("backend_message")
        return str(message) if message else "Request failed.", raw_detail
    return "Request failed.", raw_detail


class UnhandledExceptionMiddleware(BaseHTTPMiddleware):
    """Catches any exception a route/dependency doesn't handle and returns the
    same JSON envelope as `configure_exception_handlers`' old `Exception`
    handler -- but as real middleware, not `@app.exception_handler(Exception)`.

    Starlette treats a handler registered for the bare `Exception` class
    specially: it becomes the handler for `ServerErrorMiddleware`, which Starlette
    wraps around the ENTIRE app -- outside every middleware added via
    `app.add_middleware` (CORSMiddleware, SecurityHeadersMiddleware,
    RequestIdMiddleware, ...). So a 500 handled that way was returned with none
    of those headers, and browsers reported it to JS as an opaque
    `TypeError: Failed to fetch` rather than a readable error (found while
    diagnosing the Planos e Assinatura page, 2026-07-21).

    This class must be added via `app.add_middleware()` BEFORE every other
    middleware (i.e. first call, so it ends up innermost -- Starlette makes the
    last-added middleware outermost) so CORS/security/request-id headers are
    still applied normally to the response it constructs.
    """

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        try:
            return await call_next(request)
        except Exception as exc:
            logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content=_build_error_payload(code="internal_server_error", message="Internal server error."),
            )


def configure_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def starlette_http_exception_handler(
        request: Request,
        exc: StarletteHTTPException,
    ) -> JSONResponse:
        logger.warning(
            "StarletteHTTPException on %s %s: %s",
            request.method,
            request.url.path,
            exc.detail,
        )
        message, detail = _http_message_and_detail(exc.detail)
        payload = _build_error_payload(
            code=f"http_{exc.status_code}",
            message=message,
            detail=detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=payload,
            headers=exc.headers,
        )

    @app.exception_handler(HTTPException)
    async def http_exception_handler(
        request: Request,
        exc: HTTPException,
    ) -> JSONResponse:
        logger.warning(
            "HTTPException on %s %s: %s",
            request.method,
            request.url.path,
            exc.detail,
        )
        message, detail = _http_message_and_detail(exc.detail)
        payload = _build_error_payload(
            code=f"http_{exc.status_code}",
            message=message,
            detail=detail,
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=payload,
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        # Build the safe detail shape once and reuse it for BOTH the log and the
        # response. Never log exc.errors() directly: its `input` field echoes the
        # raw request value, which would leak secrets (API keys, passwords, tokens)
        # into server logs.
        safe_details = [
            {
                "location": list(error["loc"]),
                "message": error["msg"],
                "type": error["type"],
            }
            for error in exc.errors()
        ]
        logger.warning(
            "Validation error on %s %s: %s",
            request.method,
            request.url.path,
            safe_details,
        )
        payload = _build_error_payload(
            code="validation_error",
            message="Request validation failed.",
            details=safe_details,
        )
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content=payload,
        )

    @app.exception_handler(ServiceUnavailableError)
    async def service_unavailable_handler(
        request: Request,
        exc: ServiceUnavailableError,
    ) -> JSONResponse:
        logger.error(
            "Service dependency unavailable on %s %s: %s",
            request.method,
            request.url.path,
            exc.code,
        )
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content=_build_error_payload(code=exc.code, message=exc.message),
            headers={"Retry-After": str(exc.retry_after)},
        )

    # No @app.exception_handler(Exception) here: see UnhandledExceptionMiddleware
    # above, which handles this case instead so CORS/security headers survive.