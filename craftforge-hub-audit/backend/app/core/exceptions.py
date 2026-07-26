from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import logging
import uuid
from app.core.config import settings

logger = logging.getLogger("app")


class AppException(Exception):
    """Base application exception."""

    def __init__(self, message: str, code: str = "app_error", status_code: int = 400):
        self.message = message
        self.code = code
        self.status_code = status_code


class NotFoundException(AppException):
    def __init__(self, entity: str, entity_id: any = None):
        msg = f"{entity} not found"
        if entity_id:
            msg += f" (id={entity_id})"
        super().__init__(msg, code="not_found", status_code=404)


class ConflictException(AppException):
    def __init__(self, message: str):
        super().__init__(message, code="conflict", status_code=409)


class UnauthorizedException(AppException):
    def __init__(self, message: str = "Unauthorized"):
        super().__init__(message, code="unauthorized", status_code=401)


class ForbiddenException(AppException):
    def __init__(self, message: str = "Forbidden"):
        super().__init__(message, code="forbidden", status_code=403)


class RateLimitException(AppException):
    def __init__(self, message: str = "Rate limit exceeded"):
        super().__init__(message, code="rate_limit", status_code=429)


async def global_exception_handler(request: Request, exc: Exception):
    """Global exception handler that returns user-safe errors."""
    correlation_id = str(uuid.uuid4())
    if isinstance(exc, AppException):
        status_code = exc.status_code
        detail = exc.message
        logger.warning(
            "Application error: %s | %s | correlation_id=%s", exc.code, detail, correlation_id
        )
        return JSONResponse(
            status_code=status_code,
            content={
                "error": {"code": exc.code, "message": detail, "correlation_id": correlation_id}
            },
        )
    elif isinstance(exc, StarletteHTTPException):
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error": {
                    "code": "http_error",
                    "message": exc.detail,
                    "correlation_id": correlation_id,
                }
            },
        )
    elif isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "error": {
                    "code": "validation_error",
                    "message": "Validation error",
                    "correlation_id": correlation_id,
                    "details": exc.errors(),
                }
            },
        )
    else:
        # Unexpected error – log full traceback, return generic message
        logger.exception("Unhandled exception: %s | correlation_id=%s", exc, correlation_id)
        if settings.debug:
            detail = str(exc)
        else:
            detail = "An unexpected error occurred. Please try again later."
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={
                "error": {
                    "code": "internal_error",
                    "message": detail,
                    "correlation_id": correlation_id,
                }
            },
        )