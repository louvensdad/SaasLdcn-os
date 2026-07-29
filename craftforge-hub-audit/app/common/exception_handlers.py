"""
Handlers globais de exceções para FastAPI.
Formata respostas de erro no padrão ErrorResponse do contrato OpenAPI.
"""

import uuid
from typing import Any

from fastapi import Request, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from loguru import logger
from pydantic import ValidationError

from app.common.errors import AppException


def _build_error_response(
    detail: str,
    status_code: int,
    correlation_id: str,
    errors: list[dict[str, Any]] | None = None,
) -> JSONResponse:
    """Constrói JSONResponse no formato padronizado (ErrorResponse)."""
    body: dict[str, Any] = {
        "detail": detail,
        "correlation_id": correlation_id,
    }
    if errors:
        body["errors"] = errors
    return JSONResponse(
        status_code=status_code,
        content=jsonable_encoder(body),
    )


def _get_correlation_id(request: Request) -> str:
    """Obtém correlation_id do cabeçalho da requisição ou gera um novo."""
    correlation_id = request.headers.get("X-Correlation-ID")
    if not correlation_id:
        correlation_id = str(uuid.uuid4())
    return correlation_id


async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Handler genérico para exceções não tratadas.
    Retorna 500 com mensagem genérica + correlation_id.
    """
    correlation_id = _get_correlation_id(request)
    logger.opt(exception=exc).error(
        "Exceção não tratada | correlation_id={correlation_id} | path={path}",
        correlation_id=correlation_id,
        path=request.url.path,
    )
    return _build_error_response(
        detail="Erro interno do servidor",
        status_code=500,
        correlation_id=correlation_id,
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """
    Handler para HTTPException (usado pelo FastAPI para 401/403/404 etc.).
    Mantém o status_code original e formata a resposta.
    """
    correlation_id = _get_correlation_id(request)
    logger.warning(
        "HTTP exception | status={status} | correlation_id={correlation_id} | path={path}",
        status=exc.status_code,
        correlation_id=correlation_id,
        path=request.url.path,
    )
    return _build_error_response(
        detail=exc.detail if isinstance(exc.detail, str) else str(exc.detail),
        status_code=exc.status_code,
        correlation_id=correlation_id,
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError | ValidationError
) -> JSONResponse:
    """
    Handler para erros de validação do Pydantic (RequestValidationError)
    e também para ValidationError puro.
    """
    correlation_id = _get_correlation_id(request)
    errors = exc.errors() if hasattr(exc, "errors") else [{"msg": str(exc)}]
    logger.info(
        "Erro de validação | correlation_id={correlation_id} | path={path} | erros={errors}",
        correlation_id=correlation_id,
        path=request.url.path,
        errors=errors,
    )
    return _build_error_response(
        detail="Dados inválidos",
        status_code=422,
        correlation_id=correlation_id,
        errors=[{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in errors],
    )


async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """
    Handler para exceções de domínio (AppException e subclasses).
    """
    correlation_id = _get_correlation_id(request)
    logger.warning(
        "App exception | code={code} | correlation_id={correlation_id} | path={path}",
        code=exc.code,
        correlation_id=correlation_id,
        path=request.url.path,
    )
    return _build_error_response(
        detail=exc.message,
        status_code=exc.status_code,
        correlation_id=correlation_id,
        errors=exc.details if exc.details else None,
    )