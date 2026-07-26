"""
Exceções de domínio da aplicação (business rules + infra).
Todas herdam de AppException para tratamento centralizado.
"""

from typing import Any, Optional


class AppException(Exception):
    """Exceção base da aplicação, com código, status HTTP e detalhes estruturados."""

    def __init__(
        self,
        message: str = "Erro interno do servidor",
        status_code: int = 500,
        code: str = "INTERNAL_ERROR",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        self.message = message
        self.status_code = status_code
        self.code = code
        self.details = details or []
        super().__init__(self.message)


class NotFoundException(AppException):
    """Recurso não encontrado (404)."""

    def __init__(
        self,
        message: str = "Recurso não encontrado",
        code: str = "NOT_FOUND",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=404, code=code, details=details)


class ConflictException(AppException):
    """Conflito de estado (409)."""

    def __init__(
        self,
        message: str = "Conflito ao processar a requisição",
        code: str = "CONFLICT",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=409, code=code, details=details)


class ValidationException(AppException):
    """Erro de validação (422)."""

    def __init__(
        self,
        message: str = "Dados inválidos",
        code: str = "VALIDATION_ERROR",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=422, code=code, details=details)


class UnauthorizedException(AppException):
    """Não autenticado (401)."""

    def __init__(
        self,
        message: str = "Autenticação necessária",
        code: str = "UNAUTHORIZED",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=401, code=code, details=details)


class ForbiddenException(AppException):
    """Acesso proibido (403)."""

    def __init__(
        self,
        message: str = "Acesso negado",
        code: str = "FORBIDDEN",
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=403, code=code, details=details)


class BusinessRuleViolation(AppException):
    """Violação de regra de negócio (422/409 a critério do chamador)."""

    def __init__(
        self,
        message: str = "Regra de negócio violada",
        code: str = "BUSINESS_RULE_VIOLATION",
        status_code: int = 422,
        details: Optional[list[dict[str, Any]]] = None,
    ) -> None:
        super().__init__(message=message, status_code=status_code, code=code, details=details)