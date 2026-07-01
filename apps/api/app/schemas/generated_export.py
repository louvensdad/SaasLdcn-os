from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

GitProvider = Literal["github", "gitlab"]
GitVisibility = Literal["private", "public", "internal"]


class GeneratedProjectExportRequest(ApiModel):
    namespace: str = Field(min_length=1)
    repo_name: str = Field(min_length=1)
    branch: str = "main"
    commit_message: str = "Initial generated project export"
    visibility: GitVisibility = "private"
    # Override the release gate: export an unverified project anyway ("exportar mesmo assim").
    force: bool = False


class GeneratedProjectExportResponse(ApiModel):
    provider: GitProvider
    namespace: str
    repo_name: str
    branch: str
    visibility: GitVisibility
    status: str
    repo_url: str | None = None
    file_count: int
    blocked: bool = False
    message: str
