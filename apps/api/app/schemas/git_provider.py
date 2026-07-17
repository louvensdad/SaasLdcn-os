from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


# User-chosen retention window for a stored provider token: 5 minutes to 90 days.
# None keeps the connection until the user disconnects.
MIN_TOKEN_TTL_SECONDS = 300
MAX_TOKEN_TTL_SECONDS = 90 * 24 * 3600


class GitProviderConnectRequest(ApiModel):
    token: str = Field(min_length=1)
    ttl_seconds: int | None = Field(default=None, ge=MIN_TOKEN_TTL_SECONDS, le=MAX_TOKEN_TTL_SECONDS)


class GitProviderConnection(ApiModel):
    contractVersion: str
    provider: Literal["github", "gitlab"]
    status: Literal["connected", "disconnected"]
    username: str | None = None
    avatar_url: str | None = None
    namespaces: list[str] = Field(default_factory=list)
    repositories_count: int = 0
    scopes: list[str] = Field(default_factory=list)
    permission: str
    last_sync: str | None = None
    expires_at: str | None = None
    # Masked hint of the stored token (e.g. "ghp_…a1b2") for the tokens list;
    # never the full value. None for connections stored before masking existed.
    masked: str | None = None


class RepositoryCreateRequest(ApiModel):
    provider: Literal["github", "gitlab"]
    namespace: str = Field(min_length=1)
    repo_name: str = Field(min_length=1)
    visibility: Literal["private", "public"] = "private"
    branch: str = Field(default="main", min_length=1)


class RepositoryDelivery(ApiModel):
    contractVersion: str
    provider: Literal["github", "gitlab"]
    namespace: str
    repo_name: str
    branch: str
    visibility: Literal["private", "public"]
    status: Literal["created", "ready"]
    repo_url: str
    provider_id: str

class RepositorySummary(ApiModel):
    contractVersion: str
    provider: Literal["github", "gitlab"]
    provider_id: str
    namespace: str
    repo_name: str
    visibility: Literal["private", "public"]
    branch: str | None = None
    repo_url: str
    last_sync: str | None = None


class RepositoryListResponse(ApiModel):
    items: list[RepositorySummary]
    page: int
    per_page: int
    has_more: bool
class RepositoryInitialCommitRequest(ApiModel):
    provider: Literal["github", "gitlab"]
    namespace: str = Field(min_length=1)
    repo_name: str = Field(min_length=1)
    branch: str = Field(default="main", min_length=1)
    commit_message: str = Field(default="Initial commit", min_length=1, max_length=200)
    files: list[dict[str, str]] = Field(min_length=1, max_length=500)


class RepositoryCommitResponse(ApiModel):
    contractVersion: str
    provider: Literal["github", "gitlab"]
    namespace: str
    repo_name: str
    branch: str
    commit_sha: str
    commit_url: str | None = None
    committed_at: str | None = None