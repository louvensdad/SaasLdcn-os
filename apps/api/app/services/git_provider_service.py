from __future__ import annotations

import base64
from datetime import UTC, datetime, timedelta
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
        self._connections: dict[tuple[str, str, Provider], dict[str, Any]] = {}
        self._repositories: dict[tuple[str, str, str], dict[str, Any]] = {}

    def connect(
        self,
        user_id: str,
        provider: Provider,
        token: str,
        workspace_id: str | None = None,
        ttl_seconds: int | None = None,
        *,
        keep_expires_at: str | None = None,
    ) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
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

        # User-chosen retention: the token (and connection) expires server-side after
        # ttl_seconds. Re-validation preserves the original window via keep_expires_at.
        profile["expires_at"] = (
            (datetime.now(UTC) + timedelta(seconds=int(ttl_seconds))).replace(microsecond=0).isoformat()
            if ttl_seconds
            else keep_expires_at
        )
        # A masked hint of the real token for the "Tokens de acesso" list -- never
        # the full value (that stays server-side, encrypted at rest).
        profile["masked"] = self._masked_token(token)
        self._connections[(workspace_id, user_id, provider)] = {"token": token, "profile": profile}
        self._storage.save_connection(user_id, provider, token, profile, workspace_id)
        return profile

    @staticmethod
    def _masked_token(token: str) -> str:
        token = token.strip()
        if len(token) <= 8:
            return "•" * len(token)
        return f"{token[:4]}…{token[-4:]}"

    def disconnect(self, user_id: str, provider: Provider, workspace_id: str | None = None) -> dict[str, Any]:
        self._connections.pop((workspace_id or f"ws_personal_{user_id}", user_id, provider), None)
        self._storage.delete_connection(user_id, provider, workspace_id)
        return self.status(user_id, provider, workspace_id)

    def status(self, user_id: str, provider: Provider, workspace_id: str | None = None) -> dict[str, Any]:
        connection = self._get_connection(user_id, provider, workspace_id)
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
            "expires_at": None,
        }

    def validate(self, user_id: str, provider: Provider, workspace_id: str | None = None) -> dict[str, Any]:
        connection = self._require_connection(user_id, provider, workspace_id)
        return self.connect(
            user_id,
            provider,
            connection["token"],
            workspace_id=workspace_id,
            keep_expires_at=connection["profile"].get("expires_at"),
        )

    def create_repository(
        self,
        user_id: str,
        provider: Provider,
        *,
        namespace: str,
        repo_name: str,
        visibility: str,
        branch: str,
        workspace_id: str | None = None,
    ) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
        connection = self._require_connection(user_id, provider, workspace_id)
        key = self._repo_key(provider, namespace, repo_name)
        existing = self._get_repository(user_id, key, workspace_id)
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
        self._repositories[(workspace_id or f"ws_personal_{user_id}", user_id, key)] = repository
        self._storage.save_repository(user_id, key, repository, workspace_id)
        return repository

    def push_initial_commit(
        self,
        user_id: str,
        provider: Provider,
        *,
        namespace: str,
        repo_name: str,
        branch: str,
        workspace_id: str | None = None,
        commit_message: str,
        files: list[dict[str, Any]],
    ) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
        connection = self._require_connection(user_id, provider, workspace_id)
        key = self._repo_key(provider, namespace, repo_name)
        repository = self._get_repository(user_id, key, workspace_id)
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
        self._repositories[(workspace_id or f"ws_personal_{user_id}", user_id, key)] = repository
        self._storage.save_repository(user_id, key, repository, workspace_id)
        return repository

    def list_repositories(self, user_id: str, provider: Provider, *, page: int = 1, per_page: int = 25, workspace_id: str | None = None) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
        connection = self._require_connection(user_id, provider, workspace_id)
        page = max(1, page); per_page = max(1, min(per_page, 100))
        try:
            with self._client(connection["token"], provider) as client:
                if provider == "github":
                    response = client.get("/user/repos", params={"page": page, "per_page": per_page, "sort": "updated", "affiliation": "owner,collaborator,organization_member"})
                else:
                    response = client.get("/projects", params={"page": page, "per_page": per_page, "order_by": "last_activity_at", "membership": "true"})
                response.raise_for_status()
                data = response.json()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Provider repository listing failed.") from exc
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Provider transport is unavailable.") from exc
        items = []
        for item in data:
            visibility = "private" if (item.get("private") if provider == "github" else item.get("visibility") == "private") else "public"
            items.append({"contractVersion": CONTRACT_VERSION, "provider": provider, "provider_id": str(item.get("id")), "namespace": item.get("owner", {}).get("login", "") if provider == "github" else item.get("namespace", {}).get("full_path", ""), "repo_name": item.get("name", ""), "visibility": visibility, "branch": item.get("default_branch"), "repo_url": item.get("html_url") if provider == "github" else item.get("web_url"), "last_sync": item.get("updated_at") if provider == "github" else item.get("last_activity_at")})
        return {"items": items, "page": page, "per_page": per_page, "has_more": len(items) == per_page}
    def initial_commit(self, user_id: str, provider: Provider, *, namespace: str, repo_name: str, branch: str, commit_message: str, files: list[dict[str, Any]], workspace_id: str | None = None) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
        connection = self._require_connection(user_id, provider, workspace_id)
        repository = self._get_repository(user_id, self._repo_key(provider, namespace, repo_name), workspace_id)
        if repository is None: raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Create the repository before pushing an initial commit.")
        try:
            result = self._push_github(connection["token"], namespace, repo_name, branch, commit_message, files) if provider == "github" else self._push_gitlab(connection["token"], repository["provider_id"], branch, commit_message, files)
        except httpx.HTTPStatusError as exc: raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Initial commit or push failed at the provider.") from exc
        repository["status"] = "ready"; repository["branch"] = branch; self._storage.save_repository(user_id, self._repo_key(provider, namespace, repo_name), repository, workspace_id)
        return {"contractVersion": CONTRACT_VERSION, "provider": provider, "namespace": namespace, "repo_name": repo_name, "branch": branch, "commit_sha": str(result.get("sha") or result.get("id") or ""), "commit_url": result.get("html_url") or result.get("web_url"), "committed_at": result.get("committed_date") or datetime.now(UTC).replace(microsecond=0).isoformat()}

    def last_commit(self, user_id: str, provider: Provider, *, namespace: str, repo_name: str, branch: str, workspace_id: str | None = None) -> dict[str, Any]:
        workspace_id = workspace_id or f"ws_personal_{user_id}"
        connection = self._require_connection(user_id, provider, workspace_id)
        repository = self._get_repository(user_id, self._repo_key(provider, namespace, repo_name), workspace_id)
        provider_id = repository["provider_id"] if repository else f"{namespace}/{repo_name}"
        try:
            with self._client(connection["token"], provider) as client:
                path = f"/repos/{quote(namespace, safe='')}/{quote(repo_name, safe='')}/commits" if provider == "github" else f"/projects/{quote(provider_id, safe='')}/repository/commits"
                response = client.get(path, params={"sha": branch, "ref_name": branch, "per_page": 1}); response.raise_for_status(); item = (response.json() or [{}])[0]
        except (httpx.HTTPError, IndexError, TypeError) as exc: raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Latest commit lookup failed at the provider.") from exc
        return {"contractVersion": CONTRACT_VERSION, "provider": provider, "namespace": namespace, "repo_name": repo_name, "branch": branch, "commit_sha": item.get("sha") or item.get("id"), "commit_url": item.get("html_url") or item.get("web_url"), "committed_at": item.get("commit", {}).get("author", {}).get("date") or item.get("committed_date")}
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

    def _push_github(self, token: str, namespace: str, repo_name: str, branch: str, message: str, files: list[dict[str, Any]]) -> dict[str, Any]:
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
            return {"sha": commit.json().get("sha"), "html_url": commit.json().get("html_url")}

    def _push_gitlab(self, token: str, provider_id: str, branch: str, message: str, files: list[dict[str, Any]]) -> dict[str, Any]:
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
            return response.json()

    def _get_connection(self, user_id: str, provider: Provider, workspace_id: str | None = None) -> dict[str, Any] | None:
        connection = self._connections.get((workspace_id or f"ws_personal_{user_id}", user_id, provider))
        if connection is None:
            connection = self._storage.get_connection(user_id, provider, workspace_id)
            if connection is not None:
                self._connections[(workspace_id or f"ws_personal_{user_id}", user_id, provider)] = connection
        if connection is not None and self._expired(connection):
            self._connections.pop((workspace_id or f"ws_personal_{user_id}", user_id, provider), None)
            self._storage.delete_connection(user_id, provider, workspace_id)
            return None
        return connection

    @staticmethod
    def _expired(connection: dict[str, Any]) -> bool:
        expires_at = (connection.get("profile") or {}).get("expires_at")
        if not expires_at:
            return False
        try:
            return datetime.fromisoformat(expires_at) <= datetime.now(UTC)
        except ValueError:
            return False

    def _get_repository(self, user_id: str, key: str, workspace_id: str | None = None) -> dict[str, Any] | None:
        repository = self._repositories.get((workspace_id or f"ws_personal_{user_id}", user_id, key))
        if repository is not None:
            return repository
        persisted = self._storage.get_repository(user_id, key, workspace_id)
        if persisted is not None:
            self._repositories[(workspace_id or f"ws_personal_{user_id}", user_id, key)] = persisted
        return persisted

    def _require_connection(self, user_id: str, provider: Provider, workspace_id: str | None = None) -> dict[str, Any]:
        connection = self._get_connection(user_id, provider, workspace_id)
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
                timeout=httpx.Timeout(30.0, connect=5.0),
                follow_redirects=False,
                trust_env=False,
            )
        return httpx.Client(base_url="https://gitlab.com/api/v4", headers={"PRIVATE-TOKEN": token}, timeout=httpx.Timeout(30.0, connect=5.0), follow_redirects=False, trust_env=False)

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
