from __future__ import annotations

from uuid import uuid4

import pytest

from app.core.security import TokenError, create_access_token, create_refresh_token, decode_token
from app.core.config import (
    Settings,
    _default_allowed_origins,
    _default_secret_key,
    _validate_production_settings,
    get_settings,
)


def _registration_payload(**overrides) -> dict:
    payload = {
        "email": f"user_{uuid4().hex}@example.com",
        "password": "SecurePassword123!",
        "full_name": "Security Test User",
        "locale": "pt-BR",
        "privacy_policy_accepted": True,
    }
    payload.update(overrides)
    return payload


def test_registration_requires_privacy_policy_acceptance(client):
    response = client.post(
        "/api/auth/register",
        json=_registration_payload(privacy_policy_accepted=False),
    )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "http_400"


def test_auth_uses_http_only_refresh_cookie_and_never_returns_it(client):
    response = client.post("/api/auth/register", json=_registration_payload())

    assert response.status_code == 201
    assert "refresh_token" not in response.text
    cookie = response.headers["set-cookie"]
    assert "ldcn_refresh_token=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie

    refresh = client.post("/api/auth/refresh")
    assert refresh.status_code == 200
    assert "refresh_token" not in refresh.text
    assert refresh.json()["tokens"]["access_token"]


def test_refresh_cookie_rejects_cross_site_origin(client):
    response = client.post(
        "/api/auth/refresh",
        headers={"Origin": "https://attacker.example"},
    )

    assert response.status_code == 403
    assert response.json()["error"]["code"] == "http_403"


def test_access_and_refresh_tokens_use_separate_signing_keys():
    settings = get_settings()
    original_access_secret = settings.secret_key
    original_refresh_secret = settings.refresh_secret_key
    settings.secret_key = "access-signing-key-that-is-distinct-and-long-enough"
    settings.refresh_secret_key = "refresh-signing-key-that-is-distinct-and-long-enough"
    try:
        access_token, _ = create_access_token("user-1", "user")
        refresh_token, _, _ = create_refresh_token("user-1", "user")

        assert decode_token(access_token, expected_type="access")["sub"] == "user-1"
        assert decode_token(refresh_token, expected_type="refresh")["sub"] == "user-1"
        with pytest.raises(TokenError):
            decode_token(access_token, expected_type="refresh")
        with pytest.raises(TokenError):
            decode_token(refresh_token, expected_type="access")
    finally:
        settings.secret_key = original_access_secret
        settings.refresh_secret_key = original_refresh_secret


def test_protected_routes_require_bearer_token(client):
    authorization = client.headers.pop("Authorization")
    try:
        response = client.get("/api/projects")
    finally:
        client.headers["Authorization"] = authorization

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["error"]["code"] == "http_401"


def test_git_integration_is_self_service_per_user(client):
    # Git connections are now per-user (not a shared, admin-only credential), so a
    # regular authenticated user reaches their OWN connection — and sees it empty
    # until they connect. Cross-user isolation is covered in test_git_providers.py.
    registration = client.post("/api/auth/register", json=_registration_payload())
    token = registration.json()["tokens"]["access_token"]

    response = client.get(
        "/api/integrations/git/github",
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 200
    assert response.json()["status"] == "disconnected"
    assert "token" not in response.text


def test_lgpd_export_contains_profile_and_safe_audit_events(client):
    response = client.get("/api/auth/me/export")

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["email"]
    assert "hashed_password" not in payload["user"]
    assert payload["audit_events"]
    assert all("event_code" in event for event in payload["audit_events"])
    assert "password" not in response.text.lower()
    assert "token" not in response.text.lower()


def test_consent_rejects_outdated_policy_version(client):
    response = client.post(
        "/api/auth/me/consent",
        json={"accepted": True, "policy_version": "outdated"},
    )

    assert response.status_code == 409


def test_account_deletion_anonymizes_user_and_revokes_access(client):
    response = client.delete("/api/auth/me")

    assert response.status_code == 200
    assert "anonymized" in response.json()["message"]
    assert client.get("/api/auth/me").status_code == 401
    assert client.post("/api/auth/refresh").status_code == 401


def test_security_headers_are_present(client):
    response = client.get("/api/health")

    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["referrer-policy"] == "no-referrer"
    assert "default-src 'none'" in response.headers["content-security-policy"]


def test_production_requires_explicit_cors_and_secret(monkeypatch):
    monkeypatch.setenv("LDCN_ENVIRONMENT", "production")
    monkeypatch.delenv("LDCN_ALLOWED_ORIGINS", raising=False)
    monkeypatch.delenv("LDCN_SECRET_KEY", raising=False)

    assert _default_allowed_origins() == []
    with pytest.raises(RuntimeError, match="LDCN_SECRET_KEY"):
        _default_secret_key()


def test_production_rejects_missing_distributed_infrastructure():
    settings = Settings(
        environment="production",
        secret_key="jwt-secret-that-is-at-least-32-characters-long",
        token_encryption_key="encryption-key-distinct-and-at-least-32-chars",
        frontend_base_url="https://app.example.com",
        api_public_base_url="https://api.example.com",
        trusted_hosts=["api.example.com"],
        allowed_origins=[],
        redis_url="",
        database_url="sqlite:///local.db",
        artifact_storage_backend="local",
        artifact_storage_bucket="",
    )

    with pytest.raises(RuntimeError) as exc_info:
        _validate_production_settings(settings)

    message = str(exc_info.value)
    assert "LDCN_ALLOWED_ORIGINS" in message
    assert "LDCN_REDIS_URL" in message
    assert "LDCN_DATABASE_URL (PostgreSQL required)" in message
    assert "LDCN_ARTIFACT_STORAGE=s3" in message
    assert "LDCN_ARTIFACT_BUCKET" in message

    settings.database_url = "mysql+pymysql://ldcn:secret@db/ldcn"
    with pytest.raises(RuntimeError, match="PostgreSQL required"):
        _validate_production_settings(settings)


def test_production_accepts_explicit_enterprise_infrastructure():
    settings = Settings(
        environment="production",
        secret_key="jwt-secret-that-is-at-least-32-characters-long",
        token_encryption_key="encryption-key-distinct-and-at-least-32-chars",
        frontend_base_url="https://app.example.com",
        api_public_base_url="https://api.example.com",
        trusted_hosts=["api.example.com"],
        allowed_origins=["https://app.example.com"],
        redis_url="redis://redis:6379/0",
        database_url="postgresql+psycopg2://ldcn:secret@db/ldcn",
        artifact_storage_backend="s3",
        artifact_storage_bucket="ldcn-production",
        metrics_bearer_token="metrics-token-that-is-at-least-32-characters-long",
    )

    _validate_production_settings(settings)


def test_rate_limit_returns_structured_429(client):
    settings = get_settings()
    previous_enabled = settings.rate_limit_enabled
    previous_limit = settings.rate_limit_auth_per_minute
    settings.rate_limit_enabled = True
    settings.rate_limit_auth_per_minute = 1
    try:
        first = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "invalid"},
        )
        second = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "invalid"},
        )
    finally:
        settings.rate_limit_enabled = previous_enabled
        settings.rate_limit_auth_per_minute = previous_limit

    assert first.status_code == 401
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "rate_limited"

@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"secret_key": "short"}, "LDCN_SECRET_KEY"),
        ({"token_encryption_key": "short"}, "LDCN_TOKEN_ENC_KEY"),
        ({"frontend_base_url": "http://app.example.com"}, "LDCN_FRONTEND_URL"),
        ({"api_public_base_url": "http://api.example.com"}, "LDCN_API_PUBLIC_URL"),
        ({"trusted_hosts": ["*"]}, "LDCN_TRUSTED_HOSTS"),
    ],
)
def test_production_security_contract_rejects_unsafe_values(overrides, message):
    values = {
        "environment": "production",
        "secret_key": "jwt-secret-that-is-at-least-32-characters-long",
        "token_encryption_key": "encryption-key-distinct-and-at-least-32-chars",
        "frontend_base_url": "https://app.example.com",
        "api_public_base_url": "https://api.example.com",
        "trusted_hosts": ["api.example.com"],
        "allowed_origins": ["https://app.example.com"],
        "redis_url": "redis://redis:6379/0",
        "database_url": "postgresql://ldcn:secret@db/ldcn",
        "artifact_storage_backend": "s3",
        "artifact_storage_bucket": "ldcn-production",
        "sandbox_egress_network": "ldcn-sandbox-egress",
        "sandbox_egress_proxy": "http://egress-proxy:3128",
        "metrics_bearer_token": "metrics-token-that-is-at-least-32-characters-long",
        "metrics_bearer_token": "metrics-token-that-is-at-least-32-characters-long",
    }
    values.update(overrides)
    with pytest.raises(RuntimeError, match=message):
        _validate_production_settings(Settings(**values))


def test_untrusted_host_header_is_rejected(client):
    response = client.get("/api/health", headers={"host": "attacker.example"})
    assert response.status_code == 400

def test_production_metrics_require_dedicated_bearer_token(client):
    settings = get_settings()
    previous_environment = settings.environment
    previous_token = settings.metrics_bearer_token
    settings.environment = "production"
    settings.metrics_bearer_token = "metrics-token-that-is-at-least-32-characters-long"
    try:
        missing = client.get("/api/metrics")
        wrong = client.get("/api/metrics", headers={"authorization": "Bearer wrong"})
        allowed = client.get(
            "/api/metrics",
            headers={"authorization": f"Bearer {settings.metrics_bearer_token}"},
        )
    finally:
        settings.environment = previous_environment
        settings.metrics_bearer_token = previous_token

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert allowed.status_code == 200
    assert "http_requests_total" in allowed.text
    assert "generation_tokens_total" in allowed.text
    assert "sandbox_executions_total" in allowed.text
