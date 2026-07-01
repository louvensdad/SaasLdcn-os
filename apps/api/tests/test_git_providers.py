from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.database import Base, database_url_for, get_engine
import app.models  # noqa: F401
from app.repositories.git_provider_repository import GitProviderRepository
from app.services.git_provider_service import GitProviderService

_GITHUB_PROFILE = {
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
}
_GITLAB_PROFILE = {**_GITHUB_PROFILE, "provider": "gitlab", "username": "operator", "scopes": ["api"]}


@pytest.fixture
def store_dir():
    # pytest's tmp_path base dir is not writable in this environment; manage our own.
    path = Path(tempfile.mkdtemp())
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


@pytest.fixture
def service(store_dir):
    storage_path = store_dir / f"git_providers_{uuid4().hex}.db"
    database_url = database_url_for(storage_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    instance = GitProviderService(GitProviderRepository(storage_path))
    try:
        yield instance
    finally:
        get_engine(database_url).dispose()


def test_provider_connection_never_returns_token(service, monkeypatch):
    monkeypatch.setattr(service, "_github_profile", lambda token: dict(_GITHUB_PROFILE))

    connection = service.connect("user-1", "github", "secret-token")

    assert connection["status"] == "connected"
    assert "token" not in connection
    assert "secret-token" not in str(connection)
    assert "token" not in service.status("user-1", "github")


def test_disconnect_revokes_runtime_connection(service, monkeypatch):
    monkeypatch.setattr(service, "_gitlab_profile", lambda token: dict(_GITLAB_PROFILE))

    service.connect("user-1", "gitlab", "secret-token")
    disconnected = service.disconnect("user-1", "gitlab")

    assert disconnected["status"] == "disconnected"
    assert service._connections == {}


def test_connections_are_isolated_per_user(service, monkeypatch):
    monkeypatch.setattr(service, "_github_profile", lambda token: dict(_GITHUB_PROFILE))

    service.connect("alice", "github", "alice-token")

    # Bob shares the same instance but must NOT see Alice's connection.
    assert service.status("bob", "github")["status"] == "disconnected"
    assert service.status("alice", "github")["status"] == "connected"


def test_connection_persists_across_service_instances(store_dir, monkeypatch):
    storage_path = store_dir / f"git_providers_{uuid4().hex}.db"
    database_url = database_url_for(storage_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    storage = GitProviderRepository(storage_path)

    first = GitProviderService(storage)
    monkeypatch.setattr(first, "_github_profile", lambda token: dict(_GITHUB_PROFILE))
    first.connect("user-1", "github", "secret-token")

    # A second instance backed by the same storage (e.g. after a process restart)
    # should see the persisted, encrypted connection for that user.
    second = GitProviderService(GitProviderRepository(storage_path))
    status = second.status("user-1", "github")

    assert status["status"] == "connected"
    assert status["username"] == "octocat"
    assert "token" not in status

    # The persisted token itself must not be stored in plaintext, and is scoped to the user.
    with storage.connection() as conn:
        row = conn.execute(
            "SELECT encrypted_token FROM git_provider_connections WHERE user_id = ? AND provider = 'github'",
            ("user-1",),
        ).fetchone()
    assert "secret-token" not in row["encrypted_token"]

    second.disconnect("user-1", "github")
    third = GitProviderService(GitProviderRepository(storage_path))
    assert third.status("user-1", "github")["status"] == "disconnected"


def test_integration_status_endpoints_are_self_service(client):
    github = client.get("/api/integrations/git/github")
    gitlab = client.get("/api/integrations/git/gitlab")

    assert github.status_code == 200
    assert gitlab.status_code == 200
    assert github.json()["status"] == "disconnected"
    assert gitlab.json()["status"] == "disconnected"
    assert "token" not in github.text
    assert "token" not in gitlab.text
