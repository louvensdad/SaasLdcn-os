from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

IngestSource = Literal["zip", "git"]
MigrationAction = Literal["migrate", "adapt", "encapsulate", "keep"]
Severity = Literal["info", "low", "medium", "high", "critical"]


class IngestGitRequest(ApiModel):
    git_url: str = Field(min_length=4)


class IngestedFile(ApiModel):
    path: str
    size_bytes: int
    language: str


class CodebaseInventory(ApiModel):
    ingest_id: str
    source: IngestSource
    file_count: int
    total_bytes: int
    skipped_count: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    files: list[IngestedFile] = Field(default_factory=list)


class SecurityFinding(ApiModel):
    severity: Severity
    code: str
    message: str
    path: str
    line: int | None = None


class ArchitectureSmell(ApiModel):
    code: str
    message: str
    related_paths: list[str] = Field(default_factory=list)


class Diagnosis(ApiModel):
    detected_stack: str
    primary_language: str
    languages: list[str] = Field(default_factory=list)
    dependency_notes: list[str] = Field(default_factory=list)
    smells: list[ArchitectureSmell] = Field(default_factory=list)
    security_findings: list[SecurityFinding] = Field(default_factory=list)


class MigrationMapping(ApiModel):
    legacy_path: str
    target_path: str
    action: MigrationAction
    note: str = ""


class MigrationPlan(ApiModel):
    target_architecture: str
    preserved_logic_note: str
    steps: list[str] = Field(default_factory=list)
    mappings: list[MigrationMapping] = Field(default_factory=list)


class ModernizeResponse(ApiModel):
    inventory: CodebaseInventory
    diagnosis: Diagnosis
    plan: MigrationPlan


class ModernizeGenerateRequest(ApiModel):
    ingest_id: str = Field(min_length=1)
    project_name: str = "modernized-project"
    user_model_choice: str | None = None
    persist: bool = True


class ModernizeGenerateResponse(ApiModel):
    ok: bool
    project_id: str | None = None
    file_count: int = 0
    written: bool = False
    degraded: bool = False
    errors: list[str] = Field(default_factory=list)
