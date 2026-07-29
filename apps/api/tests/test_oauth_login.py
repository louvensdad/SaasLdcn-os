from __future__ import annotations

from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import session_factory
from app.models.user import OAuthAccount
from app.repositories.user_repository import UserRepository
from app.services import auth_service as auth_service_module


@pytest.fixture
def oauth_settings():
    """Configure Google + GitHub OAuth credentials for the duration of a test,
    mirroring how test_rate_limit_returns_structured_429 mutates the cached
    Settings singleton directly and restores it afterwards."""
    settings = get_settings()
    previous = (
        settings.google_client_id,
        settings.google_client_secret,
        settings.github_client_id,
        settings.github_client_secret,
    )
    settings.google_client_id = "google-test-client-id"
    settings.google_client_secret = "google-test-client-secret"
    settings.github_client_id = "github-test-client-id"
    settings.github_client_secret = "github-test-client-secret"
    try:
        yield settings
    finally:
        (
            settings.google_client_id,
            settings.google_client_secret,
            settings.github_client_id,
            settings.github_client_secret,
        ) = previous


class _FakeResponse:
    def __init__(self, payload):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self):
        return self._payload


class _FakeOAuthClient:
    """Stands in for httpx.Client, routing by URL to canned provider responses."""

    def __init__(self, responses: dict[str, dict]) -> None:
        self._responses = responses

    def __enter__(self) -> "_FakeOAuthClient":
        return self

    def __exit__(self, *exc_info) -> None:
        return None

    def post(self, url: str, **_kwargs) -> _FakeResponse:
        return _FakeResponse(self._responses[url])

    def get(self, url: str, **_kwargs) -> _FakeResponse:
        return _FakeResponse(self._responses[url])


def _install_fake_httpx(monkeypatch, responses: dict[str, dict]) -> None:
    monkeypatch.setattr(
        auth_service_module.httpx,
        "Client",
        lambda **_kwargs: _FakeOAuthClient(responses),
    )


def _google_responses(*, sub: str, email: str, verified: bool = True) -> dict:
    return {
        "https://oauth2.googleapis.com/token": {"access_token": "google-access-token", "id_token": "google-id-token", "expires_in": 3600},
        "https://oauth2.googleapis.com/tokeninfo": {
            "aud": "google-test-client-id", "iss": "https://accounts.google.com",
            "nonce": "matching-nonce", "sub": sub,
        },
        "https://www.googleapis.com/oauth2/v3/userinfo": {
            "sub": sub,
            "email": email,
            "email_verified": verified,
            "name": "Ada Lovelace",
        },
    }


def _set_oauth_cookies(client, *, google: bool = False, state: str = "matching-state") -> None:
    client.cookies.set("ldcn_oauth_state", state)
    client.cookies.set("ldcn_oauth_pkce", "test-code-verifier")
    if google:
        client.cookies.set("ldcn_oauth_nonce", "matching-nonce")


def _github_responses(*, user_id: int, email: str | None, login: str = "ada") -> dict:
    return {
        "https://github.com/login/oauth/access_token": {"access_token": "github-access-token"},
        "https://api.github.com/user": {"id": user_id, "login": login, "name": "Ada Lovelace", "email": email},
        "https://api.github.com/user/emails": [
            {"email": email, "primary": True, "verified": True},
        ] if email else [],
    }


def test_oauth_start_redirects_to_provider_and_sets_state_cookie(client, oauth_settings):
    response = client.get("/api/auth/oauth/google/start", follow_redirects=False)

    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth")
    assert "client_id=google-test-client-id" in location
    assert "code_challenge_method=S256" in location
    assert "nonce=" in location
    assert "ldcn_oauth_state=" in response.headers["set-cookie"]
    assert "ldcn_oauth_pkce=" in response.headers["set-cookie"]
    assert "HttpOnly" in response.headers["set-cookie"]


def test_oauth_start_without_credentials_redirects_home_with_error(client):
    settings = get_settings()
    previous = (settings.google_client_id, settings.google_client_secret)
    settings.google_client_id = ""
    settings.google_client_secret = ""
    try:
        response = client.get("/api/auth/oauth/google/start", follow_redirects=False)
    finally:
        settings.google_client_id, settings.google_client_secret = previous

    assert response.status_code == 302
    assert response.headers["location"] == f"{settings.frontend_base_url}/auth/callback?oauth=error&reason=not_configured"


def test_oauth_callback_rejects_mismatched_state(client, oauth_settings):
    _set_oauth_cookies(client, google=True, state="expected-state")
    response = client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "irrelevant", "state": "wrong-state"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "oauth=error&reason=invalid_state" in response.headers["location"]


def test_oauth_callback_rejects_provider_denial(client, oauth_settings):
    response = client.get(
        "/api/auth/oauth/google/callback",
        params={"error": "access_denied"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "oauth=error&reason=provider_denied" in response.headers["location"]


def test_oauth_callback_creates_new_account_and_sets_refresh_cookie(client, oauth_settings, monkeypatch):
    email = f"oauth_{uuid4().hex}@example.com"
    _install_fake_httpx(monkeypatch, _google_responses(sub="google-subject-1", email=email))

    _set_oauth_cookies(client, google=True)
    response = client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "auth-code", "state": "matching-state"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].endswith("/auth/callback?oauth=success")
    assert "ldcn_refresh_token=" in response.headers["set-cookie"]

    # The new session should resolve to a real, active user via the cookie.
    me = client.post("/api/auth/refresh")
    assert me.status_code == 200
    assert me.json()["user"]["email"] == email


def test_oauth_callback_links_existing_password_account_by_email(client, oauth_settings, monkeypatch):
    email = f"existing_{uuid4().hex}@example.com"
    register = client.post(
        "/api/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "Existing User",
            "privacy_policy_accepted": True,
        },
    )
    existing_user_id = register.json()["user"]["user_id"]

    _install_fake_httpx(monkeypatch, _github_responses(user_id=987654, email=email))
    _set_oauth_cookies(client)
    response = client.get(
        "/api/auth/oauth/github/callback",
        params={"code": "auth-code", "state": "matching-state"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert response.headers["location"].endswith("/auth/callback?oauth=success")

    me = client.post("/api/auth/refresh")
    assert me.json()["user"]["user_id"] == existing_user_id


def test_oauth_callback_exchange_failure_redirects_with_error(client, oauth_settings, monkeypatch):
    def _boom(**_kwargs):
        raise RuntimeError("should not be called directly")

    class _RaisingClient(_FakeOAuthClient):
        def post(self, url, **kwargs):
            import httpx as httpx_module

            raise httpx_module.HTTPError("provider unreachable")

    monkeypatch.setattr(auth_service_module.httpx, "Client", lambda **_kwargs: _RaisingClient({}))

    _set_oauth_cookies(client, google=True)
    response = client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "auth-code", "state": "matching-state"},
        follow_redirects=False,
    )

    assert response.status_code == 302
    assert "oauth=error&reason=exchange_failed" in response.headers["location"]


def test_login_rejects_oauth_only_account_without_500(client, oauth_settings, monkeypatch):
    email = f"oauthonly_{uuid4().hex}@example.com"
    _install_fake_httpx(monkeypatch, _google_responses(sub="google-subject-2", email=email))
    _set_oauth_cookies(client, google=True)
    client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "auth-code", "state": "matching-state"},
        follow_redirects=False,
    )

    response = client.post("/api/auth/login", json={"email": email, "password": "anything-at-all"})

    assert response.status_code == 401


def test_oauth_callback_url_uses_configured_public_origin_not_request_host(oauth_settings):
    from app.routes.auth import _oauth_callback_url

    previous = oauth_settings.api_public_base_url
    oauth_settings.api_public_base_url = "https://api.example.com"
    try:
        callback = _oauth_callback_url(None, "google")  # request metadata is intentionally ignored
    finally:
        oauth_settings.api_public_base_url = previous
    assert callback == "https://api.example.com/api/auth/oauth/google/callback"


def test_same_email_can_link_google_and_github_without_duplicate_user(client, oauth_settings, monkeypatch):
    email = f"multi_{uuid4().hex}@example.com"
    registered = client.post("/api/auth/register", json={
        "email": email, "password": "SecurePassword123!", "full_name": "Multi Provider",
        "privacy_policy_accepted": True,
    }).json()["user"]

    _install_fake_httpx(monkeypatch, _google_responses(sub="google-multi", email=email))
    _set_oauth_cookies(client, google=True)
    google = client.get("/api/auth/oauth/google/callback", params={"code": "g", "state": "matching-state"}, follow_redirects=False)
    assert google.headers["location"].endswith("/auth/callback?oauth=success")

    _install_fake_httpx(monkeypatch, _github_responses(user_id=112233, email=email))
    _set_oauth_cookies(client)
    github = client.get("/api/auth/oauth/github/callback", params={"code": "gh", "state": "matching-state"}, follow_redirects=False)
    assert github.headers["location"].endswith("/auth/callback?oauth=success")

    repository = UserRepository()
    assert repository.get_by_email(email)["user_id"] == registered["user_id"]
    assert repository.list_oauth_providers(registered["user_id"]) == ["github", "google"]
    with session_factory()() as session:
        accounts = session.scalars(select(OAuthAccount).where(OAuthAccount.user_id == registered["user_id"])).all()
        assert len(accounts) == 2
        assert all(account.access_token_encrypted not in {"google-access-token", "github-access-token"} for account in accounts)


def test_google_callback_rejects_nonce_mismatch(client, oauth_settings, monkeypatch):
    email = f"nonce_{uuid4().hex}@example.com"
    responses = _google_responses(sub="google-nonce", email=email)
    responses["https://oauth2.googleapis.com/tokeninfo"]["nonce"] = "different-nonce"
    _install_fake_httpx(monkeypatch, responses)
    _set_oauth_cookies(client, google=True)

    response = client.get(
        "/api/auth/oauth/google/callback",
        params={"code": "auth-code", "state": "matching-state"},
        follow_redirects=False,
    )

    assert "oauth=error&reason=exchange_failed" in response.headers["location"]
