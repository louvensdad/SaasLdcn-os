from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

DocCategory = Literal[
    "overview",
    "architecture",
    "api",
    "database",
    "security",
    "testing",
    "deployment",
    "contract",
    "quality",
    "adr",
]
DocStatus = Literal[
    "missing",
    "draft",
    "generated",
    "validated",
    "inconsistent",
    "unsafe",
    "exported",
]
CheckStatus = Literal["passed", "failed", "warning"]
CheckCategory = Literal["completeness", "consistency", "security", "quality"]
FindingSeverity = Literal["warning", "high", "critical"]


class DocumentationFinding(ApiModel):
    contractVersion: str
    code: str
    severity: FindingSeverity
    category: CheckCategory
    message: str
    path: str | None = None


class DocumentationDoc(ApiModel):
    contractVersion: str
    id: str
    title: str
    category: DocCategory
    required: bool
    present: bool
    status: DocStatus
    exported: bool
    path: str | None = None
    size_bytes: int = 0
    issues: list[str] = Field(default_factory=list)


class DocumentationCheck(ApiModel):
    contractVersion: str
    id: CheckCategory
    label: str
    status: CheckStatus
    message: str


class DocumentationLibraryResponse(ApiModel):
    contractVersion: str
    project_id: str
    project_name: str
    generated_project_path: str | None = None
    score: int = Field(ge=0, le=100)
    safe: bool
    docs: list[DocumentationDoc] = Field(default_factory=list)
    checks: list[DocumentationCheck] = Field(default_factory=list)
    findings: list[DocumentationFinding] = Field(default_factory=list)
    missing_required: list[str] = Field(default_factory=list)
    present_count: int = 0
    required_count: int = 0
    generated_at: str


class DocumentationExportRequest(ApiModel):
    # Copy-to-docs is the default; moving originals is opt-in.
    organize: bool = False


class GeneratedDoc(ApiModel):
    contractVersion: str
    id: str
    title: str
    path: str
    category: str
    content: str
    mode: Literal["llm", "deterministic"]
    safe: bool
    issues: list[str] = Field(default_factory=list)
    sources: list[str] = Field(default_factory=list)


class DocumentationGenerateRequest(ApiModel):
    doc_ids: list[str] | None = None
    use_user_key: bool = False
    user_model_choice: str | None = None


class DocumentationGenerateResponse(ApiModel):
    contractVersion: str
    project_id: str
    ai_active: bool
    mode: Literal["ai", "deterministic"]
    docs: list[GeneratedDoc] = Field(default_factory=list)


class DocumentationSaveItem(ApiModel):
    id: str
    content: str


class DocumentationSaveRequest(ApiModel):
    docs: list[DocumentationSaveItem] = Field(default_factory=list)
    overwrite: bool = False


class DocumentationSaveResult(ApiModel):
    contractVersion: str
    id: str
    path: str
    written: bool
    skipped: bool
    blocked: bool
    reason: str | None = None


class DocumentationSaveResponse(ApiModel):
    contractVersion: str
    project_id: str
    saved: list[DocumentationSaveResult] = Field(default_factory=list)
    score: int = Field(ge=0, le=100)
    blocked: bool = False


class DocumentationExportResponse(ApiModel):
    contractVersion: str
    project_id: str
    exported: bool
    blocked: bool
    organized: bool = False
    reason: str | None = None
    docs_dir: str | None = None
    exported_paths: list[str] = Field(default_factory=list)
    score: int = Field(ge=0, le=100)
