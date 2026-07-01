from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

DependencyFindingStatus = Literal["missing", "outdated", "current", "managed", "skipped"]
BuildStageStatus = Literal["passed", "failed", "skipped"]


class DependencyFinding(ApiModel):
    ecosystem: Literal["pypi", "npm", "maven"]
    name: str
    requested_version: str | None = None
    latest_version: str | None = None
    status: DependencyFindingStatus
    message: str
    manifest_path: str


class DependencyAuditReport(ApiModel):
    status: Literal["passed", "failed", "skipped"]
    skipped_reason: str | None = None
    findings: list[DependencyFinding] = Field(default_factory=list)


class BuildRuntimeMetrics(ApiModel):
    """REAL resource measurements captured while building the GENERATED project in
    our controlled sandbox (never the untrusted legacy code). Wall-clock duration is
    always measured; peak memory / CPU are measured when psutil is available."""

    install_ms: int = 0
    build_ms: int = 0
    total_ms: int = 0
    peak_memory_mb: float | None = None
    cpu_seconds: float | None = None
    sampler: Literal["psutil", "wallclock"] = "wallclock"


class BuildValidationReport(ApiModel):
    installed: BuildStageStatus
    built: BuildStageStatus
    ok: bool
    skipped_reason: str | None = None
    logs_tail: str = ""
    metrics: BuildRuntimeMetrics | None = None


class GenerationValidationReport(ApiModel):
    project_id: str
    score: int
    passed: bool
    quality: dict[str, Any]
    security_findings: list[dict[str, Any]] = Field(default_factory=list)
    dependency_audit: DependencyAuditReport
    build: BuildValidationReport
    warnings: list[str] = Field(default_factory=list)
