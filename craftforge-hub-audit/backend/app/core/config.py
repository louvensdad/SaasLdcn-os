from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field, PostgresDsn, field_validator
from typing import Optional, List
import os


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False
    )

    # General
    app_name: str = "game-painel-backend"
    app_version: str = "0.1.0"
    debug: bool = False
    secret_key: str = Field(..., alias="SECRET_KEY")
    allowed_hosts: List[str] = Field(default=["localhost", "127.0.0.1"], alias="ALLOWED_HOSTS")

    # Database
    database_url: PostgresDsn = Field(..., alias="DATABASE_URL")
    db_echo: bool = False

    @field_validator("database_url", mode="before")
    @classmethod
    def validate_database_url(cls, v: str) -> str:
        if not v.startswith("postgresql"):
            raise ValueError("DATABASE_URL must start with postgresql+asyncpg://")
        return v

    # Auth
    jwt_access_token_expire_minutes: int = 30
    jwt_refresh_token_expire_days: int = 7
    jwt_algorithm: str = "HS256"
    jwt_secret_key: str = Field(..., alias="JWT_SECRET_KEY")

    # CORS
    cors_origins: List[str] = Field(default=["http://localhost:5173"], alias="CORS_ORIGINS")

    # Rate Limiting
    rate_limit_enabled: bool = True
    rate_limit_default: str = "100/minute"
    rate_limit_auth: str = "20/minute"

    # Redis
    redis_url: Optional[str] = None

    # Sentry
    sentry_dsn: Optional[str] = None

    # Logging
    log_level: str = "INFO"
    json_logs: bool = True

    @field_validator("jwt_secret_key", "secret_key")
    @classmethod
    def validate_secret_key_length(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("Secret key must be at least 32 characters long")
        return v


settings = Settings()