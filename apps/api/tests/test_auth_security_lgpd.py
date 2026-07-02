from __future__ import annotations

from uuid import uuid4

import pytest

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
        secret_key="test-secret",
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
        secret_key="test-secret",
        allowed_origins=["https://app.example.com"],
        redis_url="redis://redis:6379/0",
        database_url="postgresql+psycopg2://ldcn:secret@db/ldcn",
        artifact_storage_backend="s3",
        artifact_storage_bucket="ldcn-production",
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
