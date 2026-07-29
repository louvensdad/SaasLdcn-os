from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.localization import GeneratedProjectLocaleProfile


BackendLanguage = Literal["python", "java", "typescript", "javascript"]
BackendFramework = Literal["fastapi", "spring_boot", "quarkus", "micronaut", "nestjs", "express", "fastify"]
BackendGenerationStatus = Literal["previewed", "generated", "blocked", "failed"]
BackendArtifactKind = Literal["file", "directory", "metadata"]
BackendCapability = Literal["jwt", "postgresql", "sqlite", "h2", "swagger", "openapi", "health", "validation"]


class GenerationTarget(ApiModel):
    language: str = Field(min_length=1)
    framework: str = Field(min_length=1)
    output_path: str | None = Field(default=None, min_length=1)
    project_name: str | None = Field(default=None, min_length=1)


class GenerationProfile(ApiModel):
    profile_id: str = Field(min_length=1)
    capabilities: list[BackendCapability] = Field(default_factory=list)
    database: str | None = None
    complexity: str | None = None


class BackendGenerationRequest(ApiModel):
    project_id: str = Field(min_length=1)
    target: GenerationTarget
    profile: GenerationProfile
    locale_profile: GeneratedProjectLocaleProfile | None = None


class GeneratedArtifact(ApiModel):
    contractVersion: str
    id: str
    kind: BackendArtifactKind
    relative_path: str
    size_bytes: int
    checksum: str


class GenerationValidationCheck(ApiModel):
    id: str
    status: Literal["passed", "blocked", "failed"]
    message: str


class GenerationValidationFailure(ApiModel):
    code: str
    message: str
    recoverable: bool
    related_ids: list[str] = Field(default_factory=list)


class GenerationValidation(ApiModel):
    contractVersion: str
    status: Literal["passed", "blocked", "failed"]
    generation_enabled: bool
    security_gate: Literal["passed", "blocked"]
    handoff_readiness: Literal["ready", "blocked", "incomplete"]
    checks: list[GenerationValidationCheck] = Field(default_factory=list)
    failures: list[GenerationValidationFailure] = Field(default_factory=list)


class GeneratedProjectMetrics(ApiModel):
    contractVersion: str
    file_count: int
    directory_count: int
    total_size_bytes: int
    complexity: str
    framework: str
    template_id: str


class GenerationManifest(ApiModel):
    contractVersion: str
    generation_id: str
    project_id: str | None = None
    project_name: str
    status: BackendGenerationStatus
    target: GenerationTarget
    profile: GenerationProfile
    template_id: str
    template_name: str
    output_path: str | None = None
    artifacts: list[GeneratedArtifact] = Field(default_factory=list)
    file_tree: list[str] = Field(default_factory=list)
    validation: GenerationValidation
    metrics: GeneratedProjectMetrics
    metadata: dict[str, Any] = Field(default_factory=dict)


class BackendGenerationTemplate(ApiModel):
    contractVersion: str
    template_id: str
    name: str
    language: BackendLanguage
    framework: BackendFramework
    profiles: list[str] = Field(default_factory=list)
    implemented: bool
    capabilities: list[BackendCapability] = Field(default_factory=list)


class BackendGenerationTemplateCatalog(ApiModel):
    contractVersion: str
    templates: list[BackendGenerationTemplate] = Field(default_factory=list)
