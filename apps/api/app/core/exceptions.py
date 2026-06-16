from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


logger = logging.getLogger("ldcn.api.errors")


def _build_error_payload(
    *,
    code: str,
    message: str,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": message,
            "details": details or [],
        }
    }


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
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        payload = _build_error_payload(
            code=f"http_{exc.status_code}",
            message=detail,
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
        detail = exc.detail if isinstance(exc.detail, str) else "Request failed."
        payload = _build_error_payload(
            code=f"http_{exc.status_code}",
            message=detail,
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

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(
        request: Request,
        exc: Exception,
    ) -> JSONResponse:
        logger.exception(
            "Unhandled error on %s %s",
            request.method,
            request.url.path,
            exc_info=exc,
        )
        payload = _build_error_payload(
            code="internal_server_error",
            message="Internal server error.",
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content=payload,
        )
