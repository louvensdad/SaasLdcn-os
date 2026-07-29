"""
Pacote comum: exceções de domínio e handlers globais de erro.
"""
from app.common.exception_handlers import (
    global_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)

__all__ = [
    "global_exception_handler",
    "http_exception_handler",
    "validation_exception_handler",
]