from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path

from pydantic import BaseModel, Field


BASE_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = BASE_DIR / "app" / "data"

# Load apps/api/.env into the process environment before any Settings default
# factory reads os.environ. Real environment variables always win (override=False),
# so .env is a local-dev convenience, not an override of deployed config. The
# import is optional: without python-dotenv, plain environment variables still work.
try:
    from dotenv import load_dotenv

    load_dotenv(BASE_DIR / ".env")
except ImportError:
    pass

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
    database_url: str = Field(
        default_factory=lambda: os.environ.get(
            "LDCN_DATABASE_URL",
            f"sqlite:///{(DATA_DIR / 'ldcn_os.db').resolve().as_posix()}",
        )
    )
    # Temporary compatibility for constructors/tests that still pass a Path.
    # SQLAlchemy/Alembic use database_url as the source of truth.
    sqlite_path: Path = DATA_DIR / "ldcn_os.db"
    contracts_ready: bool = True

    # --- Auth (Fase B) ---
    secret_key: str = Field(default_factory=_default_secret_key)
    # Dedicated key for encrypting secrets at rest (git provider tokens, user LLM
    # keys), kept SEPARATE from the JWT signing secret so the two can be rotated
    # independently and a leak of one does not compromise the other (diagnosis M3).
    # When empty, the crypto layer falls back to a legacy key derived from
    # ``secret_key`` so existing encrypted data keeps decrypting.
    token_encryption_key: str = Field(default_factory=lambda: os.environ.get("LDCN_TOKEN_ENC_KEY", ""))
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    password_min_length: int = 8
    refresh_cookie_name: str = "ldcn_refresh_token"
    refresh_cookie_secure: bool = Field(
        default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production"
    )

    # --- OAuth social login (Google / GitHub) ---
    # Optional. When a provider's client id/secret is unset, its "Continue with
    # ..." button on the login page fails gracefully (redirect back with
    # oauth=error) instead of starting a flow. Register the app in each
    # provider's console with the callback URL:
    #   <this API's public base URL>/api/auth/oauth/{google,github}/callback
    google_client_id: str = Field(default_factory=lambda: os.environ.get("LDCN_GOOGLE_CLIENT_ID", "").strip())
    google_client_secret: str = Field(default_factory=lambda: os.environ.get("LDCN_GOOGLE_CLIENT_SECRET", "").strip())
    github_client_id: str = Field(default_factory=lambda: os.environ.get("LDCN_GITHUB_CLIENT_ID", "").strip())
    github_client_secret: str = Field(default_factory=lambda: os.environ.get("LDCN_GITHUB_CLIENT_SECRET", "").strip())
    # Where the browser lands after the OAuth provider hands control back to our
    # callback (both on success and on failure). Must be a URL the frontend is
    # actually served from.
    frontend_base_url: str = Field(
        default_factory=lambda: os.environ.get("LDCN_FRONTEND_URL", "http://localhost:3000")
    )

    # --- Security headers / rate limiting (Fase B) ---
    security_headers_enabled: bool = True
    hsts_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    rate_limit_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    redis_url: str = Field(default_factory=lambda: os.environ.get("LDCN_REDIS_URL", ""))
    # Generated projects are materialized locally for build tools, then snapshotted
    # to shared S3-compatible storage so another instance can restore them.
    artifact_storage_backend: str = Field(
        default_factory=lambda: os.environ.get("LDCN_ARTIFACT_STORAGE", "local").strip().lower()
    )
    artifact_storage_bucket: str = Field(
        default_factory=lambda: os.environ.get("LDCN_ARTIFACT_BUCKET", "").strip()
    )
    artifact_storage_prefix: str = Field(
        default_factory=lambda: os.environ.get("LDCN_ARTIFACT_PREFIX", "ldcn-artifacts").strip()
    )
    artifact_storage_endpoint: str = Field(
        default_factory=lambda: os.environ.get("LDCN_ARTIFACT_ENDPOINT", "").strip()
    )
    artifact_storage_region: str = Field(
        default_factory=lambda: os.environ.get("LDCN_ARTIFACT_REGION", "").strip()
    )
    rate_limit_auth_per_minute: int = 20
    rate_limit_default_per_minute: int = 240
    # Generation endpoints each trigger multiple multi-minute (paid) LLM calls, so
    # they get a much tighter, per-user bucket to prevent cost-DoS (diagnosis M5).
    rate_limit_generation_per_minute: int = 12
    # Trust the first hop of X-Forwarded-For for client identification (correct ONLY
    # behind a trusted reverse proxy / load balancer). Off by default; enable in any
    # deployment that terminates TLS at a proxy so the limiter keys on the real
    # client, not the proxy's single socket IP (diagnosis M5).
    trust_proxy_headers: bool = Field(
        default_factory=lambda: os.environ.get("LDCN_TRUST_PROXY_HEADERS", "") == "1"
    )

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

    # --- Local LLM (Ollama) ---
    # The "no API key" path: real generation via an open-source model running on
    # the user's own machine. Ollama exposes an OpenAI-compatible endpoint, so the
    # OllamaAdapter reuses the openai SDK pointed here. No key required.
    ollama_base_url: str = Field(
        default_factory=lambda: os.environ.get("LDCN_OLLAMA_BASE_URL", "http://localhost:11434/v1")
    )

    # --- OpenRouter ---
    # Online aggregator that exposes many models (OpenAI, Anthropic, Google,
    # DeepSeek, Llama, Qwen, incl. free tiers) behind one OpenAI-compatible API and
    # one key. The user supplies their OpenRouter key via "Use my own key".
    openrouter_base_url: str = Field(
        default_factory=lambda: os.environ.get("LDCN_OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
    )

    # --- DeepSeek ---
    # First-class DeepSeek API (deepseek-chat / deepseek-reasoner), OpenAI-compatible.
    # The user supplies their DeepSeek key via "Use my own key", or the server sets
    # DEEPSEEK_API_KEY. Base URL is overridable for proxies/mirrors.
    deepseek_base_url: str = Field(
        default_factory=lambda: os.environ.get("LDCN_DEEPSEEK_BASE_URL", "https://api.deepseek.com")
    )

    # --- Custom OpenAI-compatible endpoint ---
    # Plug ANY server speaking the OpenAI Chat Completions API (vLLM, LM Studio,
    # Together, Groq, Fireworks, etc.). Set the base URL and the exact model id the
    # server expects; the key is optional (many local servers ignore it) and can
    # come from this env var or the per-user vault (provider "custom").
    custom_base_url: str = Field(default_factory=lambda: os.environ.get("LDCN_CUSTOM_BASE_URL", ""))
    custom_model: str = Field(default_factory=lambda: os.environ.get("LDCN_CUSTOM_MODEL", ""))

    # --- Agent execution pool (bounded, shared) ---
    # Blocking LLM-agent calls run on ONE process-wide, bounded thread pool instead
    # of a fresh ThreadPoolExecutor per pipeline stage. This caps total worker
    # threads under concurrent generations (diagnosis B5) — each worker may hold a
    # multi-minute LLM call, so tune per host. Minimum enforced at 1.
    agent_worker_limit: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_AGENT_WORKERS", "8"))
    )
    # Max in-flight generations a single user can have at once. Each generation
    # holds agent-pool workers for multi-minute LLM calls, so an unbounded user
    # could exhaust the shared pool for everyone (audit MF3). Extra starts get 429.
    max_concurrent_generations_per_user: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MAX_CONCURRENT_GENERATIONS", "3"))
    )

    # --- User LLM key vault TTL ---
    # User-owned keys are session-scoped: they expire from the in-memory vault after
    # this many seconds (defence in depth on top of "RAM only, lost on restart").
    user_key_ttl_seconds: int = 3600

    # --- Modernize feature flags ---
    # When a flag is off, the corresponding action is hidden/blocked. Default on in
    # dev; gate per environment as needed.
    modernize_enabled: bool = True
    modernize_git_import: bool = True
    modernize_zip_upload: bool = True
    modernize_auto_refactor: bool = True
    modernize_user_llm_key: bool = True
    modernize_export: bool = True

    # --- Modernize ingestion resource limits (Enterprise) ---
    # The ingestion pipeline is NOT capped by file count: a monorepo with hundreds
    # of thousands of files (node_modules/.git/build) is fully supported because
    # those directories are ignored before anything is read. Limits are based on
    # real resources only — the effective *analyzable* code size, a per-file cap,
    # the compressed upload size, and a decompression-bomb ratio guard.
    modernize_max_analyzable_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ANALYZABLE_BYTES", str(2 * 1024 * 1024 * 1024)))
    )  # 2 GB of effective code
    modernize_max_file_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_FILE_BYTES", str(5 * 1024 * 1024)))
    )  # 5 MB per file (skips minified bundles / generated blobs)
    modernize_max_upload_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_UPLOAD_BYTES", str(4 * 1024 * 1024 * 1024)))
    )  # 4 GB compressed archive
    modernize_zip_bomb_ratio: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_ZIP_BOMB_RATIO", "1000"))
    )  # reject the archive if total uncompressed / compressed exceeds this


def _validate_production_settings(settings: Settings) -> None:
    """Reject configurations that would silently disable production guarantees."""
    if settings.artifact_storage_backend not in {"local", "s3"}:
        raise RuntimeError("LDCN_ARTIFACT_STORAGE must be 'local' or 's3'.")
    if settings.environment != "production":
        return

    missing: list[str] = []
    if not settings.allowed_origins:
        missing.append("LDCN_ALLOWED_ORIGINS")
    if not settings.redis_url.strip():
        missing.append("LDCN_REDIS_URL")
    database_url = settings.database_url.lower()
    if not database_url.startswith(("postgresql://", "postgresql+")):
        missing.append("LDCN_DATABASE_URL (PostgreSQL required)")
    if settings.artifact_storage_backend != "s3":
        missing.append("LDCN_ARTIFACT_STORAGE=s3")
    if not settings.artifact_storage_bucket:
        missing.append("LDCN_ARTIFACT_BUCKET")
    if missing:
        raise RuntimeError(
            "Invalid production configuration; set: " + ", ".join(missing)
        )


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    _validate_production_settings(settings)
    if settings.database_url.startswith("sqlite:///"):
        raw_path = settings.database_url.removeprefix("sqlite:///")
        Path(raw_path).expanduser().resolve().parent.mkdir(parents=True, exist_ok=True)
    return settings
