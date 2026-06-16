from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class GitProviderConnectRequest(ApiModel):
    token: str = Field(min_length=1)


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
