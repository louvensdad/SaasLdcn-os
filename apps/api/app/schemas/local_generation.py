from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.localization import GeneratedProjectLocaleProfile


class LocalGenerationRequest(ApiModel):
    project_id: str = Field(min_length=1)
    output_path: str = Field(min_length=1)
    locale_profile: GeneratedProjectLocaleProfile | None = None


class GeneratedArtifact(ApiModel):
    contractVersion: str
    id: str
    kind: Literal["file", "directory", "metadata"]
    relative_path: str
    size_bytes: int
    checksum: str


class GenerationTrace(ApiModel):
    contractVersion: str
    timestamp: str
    step: str
    status: Literal["started", "completed", "blocked", "failed"]
    message: str
    safe: bool = True


class GenerationFailure(ApiModel):
    contractVersion: str
    code: str
    message: str
    recoverable: bool
    related_ids: list[str] = Field(default_factory=list)


class GeneratedFileEntry(ApiModel):
    relative_path: str
    size_bytes: int
    checksum: str


class GeneratedFileMap(ApiModel):
    contractVersion: str
    root_path: str
    files: list[GeneratedFileEntry] = Field(default_factory=list)
    directories: list[str] = Field(default_factory=list)


class LocalGenerationResult(ApiModel):
    contractVersion: str
    generation_id: str
    project_id: str
    project_name: str
    status: Literal["generated", "blocked", "failed"]
    runtime: Literal["local_static_v0"] = "local_static_v0"
    template_id: str | None = None
    template_name: str | None = None
    output_path: str
    handoff_readiness: Literal["ready", "blocked", "incomplete"]
    artifacts: list[GeneratedArtifact] = Field(default_factory=list)
    file_map: GeneratedFileMap
    trace: list[GenerationTrace] = Field(default_factory=list)
    failures: list[GenerationFailure] = Field(default_factory=list)
    metadata: dict[str, Any] = Field(default_factory=dict)


class GeneratedProjectFileEntry(ApiModel):
    relative_path: str
    kind: Literal["file", "directory"]
    size_bytes: int = 0
    checksum: str | None = None
    extension: str | None = None
    preview_supported: bool = False


class GeneratedProjectSecurityStatus(ApiModel):
    status: Literal["safe", "filtered", "blocked"]
    message: str
    blocked_files: list[str] = Field(default_factory=list)
    blocked_count: int = 0


class GeneratedProjectFilesResponse(ApiModel):
    contractVersion: str
    project_id: str
    root_path: str
    files: list[GeneratedProjectFileEntry] = Field(default_factory=list)
    directories: list[GeneratedProjectFileEntry] = Field(default_factory=list)
    file_count: int
    total_size_bytes: int
    security: GeneratedProjectSecurityStatus


class GeneratedFileContentResponse(ApiModel):
    contractVersion: str
    project_id: str
    relative_path: str
    size_bytes: int
    preview_supported: bool
    content_type: Literal["text", "binary", "unsupported"]
    content: str | None = None
    unsupported_reason: str | None = None


class PreparedDownloadResponse(ApiModel):
    contractVersion: str
    project_id: str
    status: Literal["prepared"]
    download_url: str
    zip_size_bytes: int
    file_count: int
    source_size_bytes: int
    security: GeneratedProjectSecurityStatus
