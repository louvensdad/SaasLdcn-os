from __future__ import annotations

from uuid import uuid4

from app.repositories.git_provider_repository import GitProviderRepository
from app.services.git_provider_service import GitProviderService


def test_provider_connection_never_returns_token(monkeypatch):
    service = GitProviderService()
    monkeypatch.setattr(
        service,
        "_github_profile",
        lambda token: {
            "contractVersion": "v1",
            "provider": "github",
            "status": "connected",
            "username": "octocat",
            "avatar_url": None,
            "namespaces": ["example"],
            "repositories_count": 12,
            "scopes": ["repo"],
            "permission": "Repository Write",
            "last_sync": "2026-06-09T00:00:00+00:00",
        },
    )

    connection = service.connect("github", "secret-token")

    assert connection["status"] == "connected"
    assert "token" not in connection
    assert "secret-token" not in str(connection)
    assert "token" not in service.status("github")


def test_disconnect_revokes_runtime_connection(monkeypatch):
    service = GitProviderService()
    monkeypatch.setattr(
        service,
        "_gitlab_profile",
        lambda token: {
            "contractVersion": "v1",
            "provider": "gitlab",
            "status": "connected",
            "username": "operator",
            "avatar_url": None,
            "namespaces": [],
            "repositories_count": 0,
            "scopes": ["api"],
            "permission": "Repository Write",
            "last_sync": "2026-06-09T00:00:00+00:00",
        },
    )

    service.connect("gitlab", "secret-token")
    disconnected = service.disconnect("gitlab")

    assert disconnected["status"] == "disconnected"
    assert service._connections == {}


def test_connection_persists_across_service_instances(tmp_path, monkeypatch):
    storage_path = tmp_path / f"git_providers_{uuid4().hex}.db"
    storage = GitProviderRepository(storage_path)

    first = GitProviderService(storage)
    monkeypatch.setattr(
        first,
        "_github_profile",
        lambda token: {
            "contractVersion": "v1",
            "provider": "github",
            "status": "connected",
            "username": "octocat",
            "avatar_url": None,
            "namespaces": ["example"],
            "repositories_count": 12,
            "scopes": ["repo"],
            "permission": "Repository Write",
            "last_sync": "2026-06-09T00:00:00+00:00",
        },
    )
    first.connect("github", "secret-token")

    # A second instance backed by the same storage (e.g. after a process
    # restart) should see the persisted, encrypted connection without ever
    # calling connect() again.
    second = GitProviderService(GitProviderRepository(storage_path))
    status = second.status("github")

    assert status["status"] == "connected"
    assert status["username"] == "octocat"
    assert "token" not in status

    # The persisted token itself must not be stored in plaintext.
    with storage.connection() as conn:
        row = conn.execute("SELECT encrypted_token FROM git_provider_connections WHERE provider = 'github'").fetchone()
    assert "secret-token" not in row["encrypted_token"]

    second.disconnect("github")
    third = GitProviderService(GitProviderRepository(storage_path))
    assert third.status("github")["status"] == "disconnected"


def test_integration_status_endpoints_are_self_service(client):
    github = client.get("/api/integrations/git/github")
    gitlab = client.get("/api/integrations/git/gitlab")

    assert github.status_code == 200
    assert gitlab.status_code == 200
    assert github.json()["status"] == "disconnected"
    assert gitlab.json()["status"] == "disconnected"
    assert "token" not in github.text
    assert "token" not in gitlab.text
