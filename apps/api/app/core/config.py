from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"

_DEV_DEFAULT_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3100",
    "http://127.0.0.1:3100",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
    "http://localhost:3003",
    "http://127.0.0.1:3003",
]


def _default_allowed_origins() -> list[str]:
    raw = os.environ.get("LDCN_ALLOWED_ORIGINS")
    if raw:
        return [origin.strip() for origin in raw.split(",") if origin.strip()]
    if os.environ.get("LDCN_ENVIRONMENT", "local") == "production":
        return []
    return list(_DEV_DEFAULT_ORIGINS)


def _default_secret_key() -> str:
    raw = os.environ.get("LDCN_SECRET_KEY")
    if raw:
        return raw
    if os.environ.get("LDCN_ENVIRONMENT", "local") == "production":
        raise RuntimeError("LDCN_SECRET_KEY is required in production.")
    # No persistent secret configured: generate an ephemeral one for this process.
    # Tokens issued before a restart become invalid. Set LDCN_SECRET_KEY in any
    # shared/production environment so sessions survive restarts and are not
    # guessable across instances.
    return secrets.token_hex(32)


class Settings(BaseModel):
    app_name: str = "LDCN OS Backend API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    environment: str = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local"))
    debug: bool = False
    log_level: str = "INFO"
    allowed_origins: list[str] = Field(default_factory=_default_allowed_origins)
    sqlite_path: Path = DATA_DIR / "ldcn_os.db"
    contracts_ready: bool = True

    # --- Auth (Fase B) ---
    secret_key: str = Field(default_factory=_default_secret_key)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    password_min_length: int = 8
    refresh_cookie_name: str = "ldcn_refresh_token"
    refresh_cookie_secure: bool = Field(
        default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production"
    )

    # --- Security headers / rate limiting (Fase B) ---
    security_headers_enabled: bool = True
    hsts_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    rate_limit_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    rate_limit_auth_per_minute: int = 20
    rate_limit_default_per_minute: int = 240

    # --- LGPD ---
    privacy_policy_version: str = "2026-06-15"
    audit_log_retention_days: int = 730

    # --- Meta-factory LLM fallback ---
    # When a provider adapter is unavailable (missing SDK / API key / capability),
    # the router degrades to the deterministic high-fidelity MockAdapter instead of
    # failing the request. The degrade is always signalled (served_by_fallback /
    # degraded), never disguised as a real model run.
    mock_fallback_enabled: bool = True
    # Force the MockAdapter even when a real provider could be reached. Useful for
    # fully offline demos and the test suite.
    force_mock: bool = Field(default_factory=lambda: os.environ.get("LDCN_FORCE_MOCK", "") == "1")


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    settings.sqlite_path.parent.mkdir(parents=True, exist_ok=True)
    return settings
