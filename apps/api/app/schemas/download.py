from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class Download(ApiModel):
    downloadId: str = Field(validation_alias="download_id")
    projectId: str = Field(validation_alias="project_id")
    workspaceId: str | None = Field(default=None, validation_alias="workspace_id")
    status: str
    artifactId: str = Field(validation_alias="artifact_id")
    checksumSha256: str = Field(validation_alias="checksum_sha256")
    sizeBytes: int = Field(validation_alias="size_bytes")
    createdAt: str = Field(validation_alias="created_at")
    expiresAt: str = Field(validation_alias="expires_at")
    downloadedAt: str | None = Field(default=None, validation_alias="downloaded_at")
    downloadUrl: str = Field(validation_alias="download_url")