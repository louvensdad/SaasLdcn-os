from __future__ import annotations

import os
import secrets
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

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
    # --- LDCN Sandbox Execution Runtime (P0 isolation) ---
    execution_runtime: str = Field(
        default_factory=lambda: os.environ.get("EXECUTION_RUNTIME", "sandbox").strip().lower()
    )
    allow_host_execution: bool = Field(
        default_factory=lambda: os.environ.get("ALLOW_HOST_EXECUTION", "false").strip().lower() in {"1", "true", "yes"}
    )
    sandbox_container_cli: str = Field(default_factory=lambda: os.environ.get("LDCN_SANDBOX_CONTAINER_CLI", "docker").strip())
    sandbox_image: str = Field(default_factory=lambda: os.environ.get("LDCN_SANDBOX_IMAGE", "ldcn/sandbox-runtime:2026.07").strip())
    sandbox_user: str = Field(default_factory=lambda: os.environ.get("LDCN_SANDBOX_USER", "65532:65532").strip())
    sandbox_timeout_seconds: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_TIMEOUT_SECONDS", "300")))
    sandbox_memory_mb: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_MEMORY_MB", "2048")))
    sandbox_cpu_cores: float = Field(default_factory=lambda: float(os.environ.get("LDCN_SANDBOX_CPU_CORES", "1")))
    sandbox_disk_mb: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_DISK_MB", "1024")))
    sandbox_pids: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_PIDS", "128")))
    sandbox_output_bytes: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_OUTPUT_BYTES", str(2 * 1024 * 1024))))
    sandbox_generated_file_bytes: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_GENERATED_FILE_BYTES", str(256 * 1024 * 1024))))
    sandbox_open_files: int = Field(default_factory=lambda: int(os.environ.get("LDCN_SANDBOX_OPEN_FILES", "1024")))
    sandbox_egress_network: str = Field(default_factory=lambda: os.environ.get("LDCN_SANDBOX_EGRESS_NETWORK", "").strip())
    sandbox_egress_proxy: str = Field(default_factory=lambda: os.environ.get("LDCN_SANDBOX_EGRESS_PROXY", "").strip())
    sandbox_egress_proxy_container: str = Field(
        default_factory=lambda: os.environ.get("LDCN_SANDBOX_EGRESS_PROXY_CONTAINER", "ldcn-sandbox-egress-proxy").strip()
    )
    sandbox_evidence_root: Path = Field(default_factory=lambda: Path(os.environ.get("LDCN_SANDBOX_EVIDENCE_ROOT", DATA_DIR / "execution-evidence")))

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
    api_public_base_url: str = Field(
        default_factory=lambda: os.environ.get("LDCN_API_PUBLIC_URL", "http://localhost:8000")
    )
    # Always keeps 127.0.0.1 trusted regardless of LDCN_TRUSTED_HOSTS: the
    # container's own Docker healthcheck (see Dockerfile.prod /
    # docker-compose.prod.yml) hits http://127.0.0.1:8000/api/health, whose
    # Host header is "127.0.0.1" -- not the public hostname operators put in
    # LDCN_TRUSTED_HOSTS. Safe in this topology because the api container
    # never publishes its port to the host or Internet (only Caddy does,
    # which forwards the real external Host header unchanged).
    trusted_hosts: list[str] = Field(
        default_factory=lambda: list(dict.fromkeys(
            [
                host.strip().lower() for host in os.environ.get(
                    "LDCN_TRUSTED_HOSTS", "localhost,127.0.0.1,testserver"
                ).split(",") if host.strip()
            ] + ["127.0.0.1"]
        ))
    )
    # --- Security headers / rate limiting (Fase B) ---
    security_headers_enabled: bool = True
    hsts_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    rate_limit_enabled: bool = Field(default_factory=lambda: os.environ.get("LDCN_ENVIRONMENT", "local") == "production")
    redis_url: str = Field(default_factory=lambda: os.environ.get("LDCN_REDIS_URL", ""))
    metrics_bearer_token: str = Field(default_factory=lambda: os.environ.get("LDCN_METRICS_BEARER_TOKEN", "").strip())
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
    generation_job_lease_seconds: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_GENERATION_JOB_LEASE_SECONDS", "1800"))
    )
    generation_job_token_budget: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_GENERATION_JOB_TOKEN_BUDGET", "800000"))
    )
    generation_daily_token_budget: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_GENERATION_DAILY_TOKEN_BUDGET", "2000000"))
    )    # --- User LLM key vault TTL ---
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

    # --- Modernize ingestion resource limits ---
    modernize_max_analyzable_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ANALYZABLE_BYTES", str(256 * 1024 * 1024)))
    )
    modernize_max_file_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_FILE_BYTES", str(5 * 1024 * 1024)))
    )
    modernize_max_upload_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_UPLOAD_BYTES", str(256 * 1024 * 1024)))
    )
    modernize_max_archive_entries: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ARCHIVE_ENTRIES", "200000"))
    )
    modernize_max_archive_uncompressed_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ARCHIVE_UNCOMPRESSED_BYTES", str(1024 * 1024 * 1024)))
    )
    # A scanned enrollment document (vault 56 - Monetização e Consumo/Planos,
    # assinaturas e controle de acesso.md, "Plano Estudante e elegibilidade").
    student_document_max_upload_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_STUDENT_DOCUMENT_MAX_UPLOAD_BYTES", str(10 * 1024 * 1024)))
    )
    modernize_max_archive_depth: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ARCHIVE_DEPTH", "32"))
    )
    modernize_max_archive_name_bytes: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_MAX_ARCHIVE_NAME_BYTES", "1024"))
    )
    modernize_archive_scan_timeout_seconds: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_ARCHIVE_SCAN_TIMEOUT_SECONDS", "15"))
    )
    modernize_zip_bomb_ratio: int = Field(
        default_factory=lambda: int(os.environ.get("LDCN_MODERNIZE_ZIP_BOMB_RATIO", "100"))
    )
    modernize_git_allowed_hosts: list[str] = Field(
        default_factory=lambda: [
            host.strip().lower() for host in os.environ.get(
                "LDCN_MODERNIZE_GIT_ALLOWED_HOSTS", "github.com,gitlab.com,bitbucket.org"
            ).split(",") if host.strip()
        ]
    )

def _validate_production_settings(settings: Settings) -> None:
    """Reject configurations that would silently disable production guarantees."""
    if settings.artifact_storage_backend not in {"local", "s3"}:
        raise RuntimeError("LDCN_ARTIFACT_STORAGE must be 'local' or 's3'.")
    if settings.execution_runtime not in {"sandbox", "host"}:
        raise RuntimeError("EXECUTION_RUNTIME must be 'sandbox' or 'host'.")
    if settings.execution_runtime == "host" and not settings.allow_host_execution:
        raise RuntimeError("EXECUTION_RUNTIME=host requires ALLOW_HOST_EXECUTION=true.")
    if settings.execution_runtime == "host" and settings.environment not in {"local", "development", "test"}:
        raise RuntimeError("Host execution is forbidden outside local development.")
    if settings.environment != "production":
        return
    if settings.execution_runtime != "sandbox" or settings.allow_host_execution:
        raise RuntimeError("Production requires EXECUTION_RUNTIME=sandbox and ALLOW_HOST_EXECUTION=false.")

    if len(settings.secret_key) < 32:
        raise RuntimeError("Production LDCN_SECRET_KEY must contain at least 32 characters.")
    if len(settings.token_encryption_key) < 32:
        raise RuntimeError("Production requires a dedicated LDCN_TOKEN_ENC_KEY with at least 32 characters.")
    if settings.token_encryption_key == settings.secret_key:
        raise RuntimeError("JWT and token encryption keys must be distinct.")
    for name, raw_url in (
        ("LDCN_FRONTEND_URL", settings.frontend_base_url),
        ("LDCN_API_PUBLIC_URL", settings.api_public_base_url),
    ):
        parsed = urlsplit(raw_url)
        if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
            raise RuntimeError(f"Production {name} must be an HTTPS origin without credentials.")
    if any(urlsplit(origin).scheme != "https" for origin in settings.allowed_origins):
        raise RuntimeError("Production CORS origins must use HTTPS.")
    if not settings.trusted_hosts or "*" in settings.trusted_hosts:
        raise RuntimeError("Production LDCN_TRUSTED_HOSTS must be an explicit non-wildcard list.")
    missing: list[str] = []
    if not settings.allowed_origins:
        missing.append("LDCN_ALLOWED_ORIGINS")
    if not settings.redis_url.strip():
        missing.append("LDCN_REDIS_URL")
    if len(settings.metrics_bearer_token) < 32:
        missing.append("LDCN_METRICS_BEARER_TOKEN (minimum 32 characters)")
    database_url = settings.database_url.lower()
    if not database_url.startswith(("postgresql://", "postgresql+")):
        missing.append("LDCN_DATABASE_URL (PostgreSQL required)")
    if settings.artifact_storage_backend != "s3":
        missing.append("LDCN_ARTIFACT_STORAGE=s3")
    if not settings.sandbox_image:
        missing.append("LDCN_SANDBOX_IMAGE")
    if not settings.sandbox_egress_network:
        missing.append("LDCN_SANDBOX_EGRESS_NETWORK")
    if not settings.sandbox_egress_proxy:
        missing.append("LDCN_SANDBOX_EGRESS_PROXY")
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
