"""
Schemas Pydantic para entrada/saída da API (DTOs).

Todas as mensagens de erro e descrições estão em português (pt-BR)
conforme regra de localização do projeto.
"""

from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, field_validator


# ──────────────────────────────────────────────
# Enums de suporte
# ──────────────────────────────────────────────

class UserRole(str, Enum):
    user = "user"
    admin = "admin"


class UserPlan(str, Enum):
    free = "free"
    premium = "premium"
    enterprise = "enterprise"


class InstanceStatus(str, Enum):
    offline = "offline"
    online = "online"
    starting = "starting"
    stopping = "stopping"


class ExecutionStatus(str, Enum):
    pending = "pending"
    running = "running"
    success = "success"
    failed = "failed"


# ──────────────────────────────────────────────
# Schemas de Autenticação
# ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    """Payload para registro de novo usuário."""
    username: str = Field(
        ..., min_length=3, max_length=64, description="Nome de usuário"
    )
    email: str = Field(
        ..., max_length=254, description="E-mail do usuário"
    )
    password: str = Field(
        ..., min_length=8, max_length=128, description="Senha (mín. 8 caracteres, com maiúscula, minúscula e número)"
    )

    @field_validator("password")
    @classmethod
    def password_complexity(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("A senha deve conter pelo menos uma letra maiúscula")
        if not any(c.islower() for c in v):
            raise ValueError("A senha deve conter pelo menos uma letra minúscula")
        if not any(c.isdigit() for c in v):
            raise ValueError("A senha deve conter pelo menos um número")
        return v


class LoginRequest(BaseModel):
    """Payload para login."""
    email: str = Field(..., description="E-mail do usuário")
    password: str = Field(..., description="Senha do usuário")


class RefreshRequest(BaseModel):
    """Payload para renovação do token de acesso."""
    refresh_token: str = Field(..., description="Token de atualização (refresh token)")


class TokenResponse(BaseModel):
    """Resposta dos endpoints de autenticação."""
    access_token: str = Field(..., description="Token JWT de acesso curto")
    refresh_token: str = Field(..., description="Token JWT de atualização longo")
    token_type: str = Field(default="bearer", description="Tipo do token")


# ──────────────────────────────────────────────
# Schemas de Usuário
# ──────────────────────────────────────────────

class UserResponse(BaseModel):
    """Resposta com dados do usuário logado."""
    id: int = Field(..., description="ID do usuário")
    username: str = Field(..., description="Nome de usuário")
    email: str = Field(..., description="E-mail do usuário")
    role: UserRole = Field(..., description="Papel (user/admin)")
    plan: UserPlan = Field(..., description="Plano do usuário")
    created_at: datetime = Field(..., description="Data de criação")
    updated_at: datetime = Field(..., description="Data da última atualização")

    class Config:
        from_attributes = True


class UserAdminResponse(BaseModel):
    """Resposta com dados completos de um usuário (admin)."""
    id: int
    username: str
    email: str
    role: UserRole
    plan: UserPlan
    is_active: bool = Field(default=True, description="Se a conta está ativa")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Schemas de Conta (Account)
# ──────────────────────────────────────────────

class CreateAccountRequest(BaseModel):
    """Payload para cadastrar nova conta de jogo."""
    game_username: str = Field(..., max_length=128, description="Nome de usuário no jogo")
    game_password: str = Field(..., max_length=256, description="Senha da conta do jogo")
    game: str = Field(..., max_length=64, description="Nome do jogo (ex: 'World of Warcraft')")
    server: str = Field(..., max_length=64, description="Servidor/região do jogo")


class UpdateAccountRequest(BaseModel):
    """Payload para atualizar parcialmente uma conta de jogo."""
    game_username: Optional[str] = Field(None, max_length=128, description="Novo nome de usuário no jogo")
    game_password: Optional[str] = Field(None, max_length=256, description="Nova senha da conta do jogo")
    game: Optional[str] = Field(None, max_length=64, description="Novo nome do jogo")
    server: Optional[str] = Field(None, max_length=64, description="Novo servidor/região")


class AccountResponse(BaseModel):
    """Resposta com dados de uma conta de jogo."""
    id: int = Field(..., description="ID da conta")
    user_id: int = Field(..., description="ID do usuário dono da conta")
    game_username: str
    game: str
    server: str
    status: InstanceStatus = Field(default=InstanceStatus.offline, description="Status atual da instância")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Schemas de Instância
# ──────────────────────────────────────────────

class InstanceResponse(BaseModel):
    """Resposta com dados de uma instância em execução."""
    id: int
    account_id: int
    status: InstanceStatus
    fps: Optional[float] = Field(None, description="FPS atual da instância")
    ram_usage_mb: Optional[float] = Field(None, alias="ram_usage_mb", description="Uso de RAM em MB")
    started_at: Optional[datetime] = None
    updated_at: datetime

    class Config:
        from_attributes = True
        populate_by_name = True


# ──────────────────────────────────────────────
# Schemas de Macro
# ──────────────────────────────────────────────

class CreateMacroRequest(BaseModel):
    """Payload para criar uma nova macro."""
    name: str = Field(..., min_length=1, max_length=128, description="Nome da macro")
    description: Optional[str] = Field(None, max_length=500, description="Descrição da macro")
    script_content: str = Field(..., description="Código/script de automação")


class UpdateMacroRequest(BaseModel):
    """Payload para atualizar parcialmente uma macro."""
    name: Optional[str] = Field(None, min_length=1, max_length=128)
    description: Optional[str] = Field(None, max_length=500)
    script_content: Optional[str] = None


class MacroResponse(BaseModel):
    """Resposta com dados de uma macro."""
    id: int
    name: str
    description: Optional[str] = None
    script_content: str
    created_by: int = Field(..., description="ID do usuário que criou a macro")
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Schemas de Log de Execução
# ──────────────────────────────────────────────

class ExecutionLogResponse(BaseModel):
    """Resposta com dados de um log de execução de macro."""
    id: int
    macro_id: int
    instance_id: int
    status: ExecutionStatus
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    result: Optional[Any] = Field(None, description="Resultado da macro (JSON)")
    error_message: Optional[str] = Field(None, description="Mensagem de erro, se houver")

    class Config:
        from_attributes = True


# ──────────────────────────────────────────────
# Schemas de Erro (HTTP)
# ──────────────────────────────────────────────

class ErrorResponse(BaseModel):
    """Resposta padronizada para erros da API."""
    detail: str = Field(..., description="Mensagem de erro descritiva")
    status_code: int = Field(..., description="Código HTTP do erro")
    correlation_id: Optional[str] = Field(None, description="ID de correlação para rastreamento")


class ValidationErrorItem(BaseModel):
    """Item individual de erro de validação."""
    loc: list[str] = Field(..., description="Caminho do campo com erro")
    msg: str = Field(..., description="Mensagem do erro")
    type: str = Field(..., description="Tipo do erro")


class ValidationError(BaseModel):
    """Erro de validação (422)."""
    detail: list[ValidationErrorItem]


class Forbidden(ErrorResponse):
    """Erro 403 - Acesso proibido."""
    detail: str = "Você não tem permissão para acessar este recurso."
    status_code: int = 403


class NotFound(ErrorResponse):
    """Erro 404 - Recurso não encontrado."""
    detail: str = "O recurso solicitado não foi encontrado."
    status_code: int = 404


class InternalServerError(ErrorResponse):
    """Erro 500 - Erro interno do servidor."""
    detail: str = "Ocorreu um erro interno. Tente novamente mais tarde."
    status_code: int = 500


class RateLimit(ErrorResponse):
    """Erro 429 - Limite de requisições excedido."""
    detail: str = "Muitas requisições. Aguarde antes de tentar novamente."
    status_code: int = 429


class Unauthorized(ErrorResponse):
    """Erro 401 - Não autenticado."""
    detail: str = "Credenciais inválidas ou token expirado."
    status_code: int = 401