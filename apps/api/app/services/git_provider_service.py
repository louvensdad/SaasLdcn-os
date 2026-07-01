from __future__ import annotations

import base64
from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import quote

import httpx
from fastapi import HTTPException, status

from app.data.foundation import CONTRACT_VERSION
from app.repositories.git_provider_repository import GitProviderRepository

Provider = Literal["github", "gitlab"]


class GitProviderService:
    """Provider credentials and provider API transport.

    Connections and repositories are cached in-memory for the lifetime of this
    instance (``_connections`` / ``_repositories``) and persisted to SQLite via
    ``_storage`` with tokens encrypted at rest, so connections survive process
    restarts.
    """

    def __init__(self, storage: GitProviderRepository | None = None) -> None:
        self._storage = storage or GitProviderRepository()
        # Caches are keyed per user so one user's credentials are never served to
        # another: (user_id, provider) for connections, (user_id, repo_key) for repos.
        self._connections: dict[tuple[str, Provider], dict[str, Any]] = {}
        self._repositories: dict[tuple[str, str], dict[str, Any]] = {}

    def connect(self, user_id: str, provider: Provider, token: str) -> dict[str, Any]:
        token = token.strip()
        if not token:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="A provider token is required.")

        try:
            profile = self._github_profile(token) if provider == "github" else self._gitlab_profile(token)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"{self._label(provider)} rejected the token. Update the token and try again.",
                ) from exc
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{self._label(provider)} connection validation failed.",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"{self._label(provider)} is unavailable. Try again shortly.",
            ) from exc

        self._connections[(user_id, provider)] = {"token": token, "profile": profile}
        self._storage.save_connection(user_id, provider, token, profile)
        return profile

    def disconnect(self, user_id: str, provider: Provider) -> dict[str, Any]:
        self._connections.pop((user_id, provider), None)
        self._storage.delete_connection(user_id, provider)
        return self.status(user_id, provider)

    def status(self, user_id: str, provider: Provider) -> dict[str, Any]:
        connection = self._get_connection(user_id, provider)
        if connection:
            return connection["profile"]
        return {
            "contractVersion": CONTRACT_VERSION,
            "provider": provider,
            "status": "disconnected",
            "username": None,
            "avatar_url": None,
            "namespaces": [],
            "repositories_count": 0,
            "scopes": [],
            "permission": "Not connected",
            "last_sync": None,
        }

    def validate(self, user_id: str, provider: Provider) -> dict[str, Any]:
        connection = self._require_connection(user_id, provider)
        return self.connect(user_id, provider, connection["token"])

    def create_repository(
        self,
        user_id: str,
        provider: Provider,
        *,
        namespace: str,
        repo_name: str,
        visibility: str,
        branch: str,
    ) -> dict[str, Any]:
        connection = self._require_connection(user_id, provider)
        key = self._repo_key(provider, namespace, repo_name)
        existing = self._get_repository(user_id, key)
        if existing:
            return existing

        try:
            repository = (
                self._create_github_repository(user_id, connection["token"], namespace, repo_name, visibility, branch)
                if provider == "github"
                else self._create_gitlab_repository(user_id, connection["token"], namespace, repo_name, visibility, branch)
            )
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Repository write permission missing. Reauthorize the provider connection.",
                ) from exc
            if exc.response.status_code in {400, 409, 422}:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Repository could not be created. Verify the namespace, repository name, and whether it already exists.",
                ) from exc
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Provider repository creation failed.") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Provider transport is unavailable.") from exc

        repository["status"] = "created"
        self._repositories[(user_id, key)] = repository
        self._storage.save_repository(user_id, key, repository)
        return repository

    def push_initial_commit(
        self,
        user_id: str,
        provider: Provider,
        *,
        namespace: str,
        repo_name: str,
        branch: str,
        commit_message: str,
        files: list[dict[str, Any]],
    ) -> dict[str, Any]:
        connection = self._require_connection(user_id, provider)
        key = self._repo_key(provider, namespace, repo_name)
        repository = self._get_repository(user_id, key)
        if repository is None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Create the repository before exporting files.")

        try:
            if provider == "github":
                self._push_github(connection["token"], namespace, repo_name, branch, commit_message, files)
            else:
                self._push_gitlab(connection["token"], repository["provider_id"], branch, commit_message, files)
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code in {401, 403}:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Repository write permission missing. Reauthorize the provider connection.",
                ) from exc
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Initial commit or push failed at the provider.") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Provider transport is unavailable.") from exc

        repository["status"] = "ready"
        repository["branch"] = branch
        self._repositories[(user_id, key)] = repository
        self._storage.save_repository(user_id, key, repository)
        return repository

    def _github_profile(self, token: str) -> dict[str, Any]:
        with self._client(token, "github") as client:
            response = client.get("/user")
            response.raise_for_status()
            user = response.json()
            orgs_response = client.get("/user/orgs", params={"per_page": 100})
            orgs_response.raise_for_status()
            repos_response = client.get("/user/repos", params={"per_page": 1, "affiliation": "owner,collaborator,organization_member"})
            repos_response.raise_for_status()
        scopes = [item.strip() for item in response.headers.get("x-oauth-scopes", "").split(",") if item.strip()]
        return self._profile(
            "github",
            user.get("login"),
            user.get("avatar_url"),
            [item["login"] for item in orgs_response.json()],
            self._total(repos_response),
            scopes,
            "Repository Write" if not scopes or any(scope in {"repo", "public_repo"} for scope in scopes) else "Repository permission requires validation",
        )

    def _gitlab_profile(self, token: str) -> dict[str, Any]:
        with self._client(token, "gitlab") as client:
            response = client.get("/user")
            response.raise_for_status()
            user = response.json()
            groups_response = client.get("/groups", params={"per_page": 100, "min_access_level": 30})
            groups_response.raise_for_status()
            projects_response = client.get("/projects", params={"per_page": 1, "membership": "true"})
            projects_response.raise_for_status()
        return self._profile(
            "gitlab",
            user.get("username"),
            user.get("avatar_url"),
            [item["full_path"] for item in groups_response.json()],
            self._total(projects_response),
            ["api"],
            "Repository Write",
        )

    def _create_github_repository(self, user_id: str, token: str, namespace: str, repo_name: str, visibility: str, branch: str) -> dict[str, Any]:
        profile = self.status(user_id, "github")
        path = "/user/repos" if namespace == profile["username"] else f"/orgs/{quote(namespace, safe='')}/repos"
        with self._client(token, "github") as client:
            response = client.post(path, json={"name": repo_name, "private": visibility == "private", "auto_init": False})
            response.raise_for_status()
            data = response.json()
        return self._repository("github", namespace, repo_name, branch, visibility, data["html_url"], str(data["id"]))

    def _create_gitlab_repository(self, user_id: str, token: str, namespace: str, repo_name: str, visibility: str, branch: str) -> dict[str, Any]:
        profile = self.status(user_id, "gitlab")
        payload: dict[str, Any] = {"name": repo_name, "visibility": visibility, "initialize_with_readme": False}
        with self._client(token, "gitlab") as client:
            if namespace != profile["username"]:
                group = client.get(f"/groups/{quote(namespace, safe='')}")
                group.raise_for_status()
                payload["namespace_id"] = group.json()["id"]
            response = client.post("/projects", json=payload)
            response.raise_for_status()
            data = response.json()
        return self._repository("gitlab", namespace, repo_name, branch, visibility, data["web_url"], str(data["id"]))

    def _push_github(self, token: str, namespace: str, repo_name: str, branch: str, message: str, files: list[dict[str, Any]]) -> None:
        prefix = f"/repos/{quote(namespace, safe='')}/{quote(repo_name, safe='')}/git"
        with self._client(token, "github") as client:
            tree_entries = []
            for item in files:
                blob = client.post(f"{prefix}/blobs", json={"content": base64.b64encode(item["content"]).decode(), "encoding": "base64"})
                blob.raise_for_status()
                tree_entries.append({"path": item["relative_path"], "mode": "100644", "type": "blob", "sha": blob.json()["sha"]})
            tree = client.post(f"{prefix}/trees", json={"tree": tree_entries})
            tree.raise_for_status()
            commit = client.post(f"{prefix}/commits", json={"message": message, "tree": tree.json()["sha"], "parents": []})
            commit.raise_for_status()
            ref = client.post(f"{prefix}/refs", json={"ref": f"refs/heads/{branch}", "sha": commit.json()["sha"]})
            ref.raise_for_status()

    def _push_gitlab(self, token: str, provider_id: str, branch: str, message: str, files: list[dict[str, Any]]) -> None:
        actions = [
            {
                "action": "create",
                "file_path": item["relative_path"],
                "content": base64.b64encode(item["content"]).decode(),
                "encoding": "base64",
            }
            for item in files
        ]
        with self._client(token, "gitlab") as client:
            response = client.post(
                f"/projects/{quote(provider_id, safe='')}/repository/commits",
                json={"branch": branch, "commit_message": message, "actions": actions},
            )
            response.raise_for_status()

    def _get_connection(self, user_id: str, provider: Provider) -> dict[str, Any] | None:
        connection = self._connections.get((user_id, provider))
        if connection is not None:
            return connection
        persisted = self._storage.get_connection(user_id, provider)
        if persisted is not None:
            self._connections[(user_id, provider)] = persisted
        return persisted

    def _get_repository(self, user_id: str, key: str) -> dict[str, Any] | None:
        repository = self._repositories.get((user_id, key))
        if repository is not None:
            return repository
        persisted = self._storage.get_repository(user_id, key)
        if persisted is not None:
            self._repositories[(user_id, key)] = persisted
        return persisted

    def _require_connection(self, user_id: str, provider: Provider) -> dict[str, Any]:
        connection = self._get_connection(user_id, provider)
        if connection is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{self._label(provider)} account not connected. Connect {self._label(provider)} in Settings > Integrations.",
            )
        return connection

    @staticmethod
    def _client(token: str, provider: Provider) -> httpx.Client:
        if provider == "github":
            return httpx.Client(
                base_url="https://api.github.com",
                headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"},
                timeout=30,
            )
        return httpx.Client(base_url="https://gitlab.com/api/v4", headers={"PRIVATE-TOKEN": token}, timeout=30)

    @staticmethod
    def _total(response: httpx.Response) -> int:
        raw = response.headers.get("x-total")
        return int(raw) if raw and raw.isdigit() else len(response.json())

    @staticmethod
    def _profile(provider: Provider, username: str | None, avatar_url: str | None, namespaces: list[str], count: int, scopes: list[str], permission: str) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "provider": provider,
            "status": "connected",
            "username": username,
            "avatar_url": avatar_url,
            "namespaces": namespaces,
            "repositories_count": count,
            "scopes": scopes,
            "permission": permission,
            "last_sync": datetime.now(UTC).replace(microsecond=0).isoformat(),
        }

    @staticmethod
    def _repository(provider: Provider, namespace: str, repo_name: str, branch: str, visibility: str, url: str, provider_id: str) -> dict[str, Any]:
        return {
            "contractVersion": CONTRACT_VERSION,
            "provider": provider,
            "namespace": namespace,
            "repo_name": repo_name,
            "branch": branch,
            "visibility": visibility,
            "status": "created",
            "repo_url": url,
            "provider_id": provider_id,
        }

    @staticmethod
    def _repo_key(provider: Provider, namespace: str, repo_name: str) -> str:
        return f"{provider}:{namespace}/{repo_name}".lower()

    @staticmethod
    def _label(provider: Provider) -> str:
        return "GitHub" if provider == "github" else "GitLab"


git_provider_service = GitProviderService()
