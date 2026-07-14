from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

DependencyFindingStatus = Literal["missing", "outdated", "current", "managed", "skipped", "vulnerable"]
BuildStageStatus = Literal["passed", "failed", "skipped", "skipped_after_failure"]
VulnerabilitySeverity = Literal["CRITICAL", "HIGH", "MODERATE", "LOW", "UNKNOWN"]


class VulnerabilityFinding(ApiModel):
    """One known vulnerability affecting the exact requested version, from the
    OSV.dev database (the same aggregator GitHub Advisory/PyPA/RustSec/etc. feed
    into) — real CVE/GHSA IDs, not a curated table."""

    id: str  # OSV/GHSA id, e.g. "GHSA-29mw-wpgm-hmr9"
    aliases: list[str] = Field(default_factory=list)  # e.g. ["CVE-2020-28500"]
    summary: str
    severity: VulnerabilitySeverity = "UNKNOWN"
    url: str = ""


class DependencyFinding(ApiModel):
    ecosystem: Literal["pypi", "npm", "maven", "nuget", "go", "crates", "rubygems", "packagist"]
    name: str
    requested_version: str | None = None
    latest_version: str | None = None
    status: DependencyFindingStatus
    message: str
    manifest_path: str
    vulnerabilities: list[VulnerabilityFinding] = Field(default_factory=list)


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


class BuildCommandRecord(ApiModel):
    """One real command executed during build validation — the audit trail that
    build.report.json exposes (comando, cwd, exitCode, duração, stdout/stderr)."""

    phase: Literal["dependency_validation", "preflight", "install", "build"] = "build"
    command: str
    cwd: str
    exit_code: int | None = None
    duration_ms: int = 0
    stdout_tail: str = ""
    stderr_tail: str = ""
    stdout: str = ""
    stderr: str = ""


class ClassifiedBuildErrorModel(ApiModel):
    """Typed build error produced by the BuildErrorClassifier."""

    code: str
    message: str
    root_cause: str
    suggested_fix: str
    package: str | None = None
    auto_fixable: bool = False
    # Peer-conflict diagnosis (Stack Compatibility Engine): conflicting package,
    # current version, required version, suggested compatible version, impact,
    # and whether resolving it needs an explicit user decision (anchor change).
    conflict: dict[str, Any] | None = None


class BuildRepairAttempt(ApiModel):
    """One pass of the Build Auto-Repair loop: which classified error was found,
    which patch was applied, and whether the retry could proceed."""

    phase: Literal["preflight", "install", "build"]
    attempt: int
    strategy: Literal["standard", "simplified"] = "standard"
    error: ClassifiedBuildErrorModel
    patch: str | None = None
    applied: bool = False
    detail: str = ""


class ManualBuildFixGuide(ApiModel):
    root_cause: str
    original_error: str
    affected_files: list[str] = Field(default_factory=list)
    problematic_dependencies: list[str] = Field(default_factory=list)
    suggested_versions: dict[str, str] = Field(default_factory=dict)
    commands: list[str] = Field(default_factory=list)
    steps: list[str] = Field(default_factory=list)
    patches_applied: list[str] = Field(default_factory=list)
    full_logs: str = ""


class BuildValidationReport(ApiModel):
    installed: BuildStageStatus
    built: BuildStageStatus
    ok: bool
    skipped_reason: str | None = None
    logs_tail: str = ""
    metrics: BuildRuntimeMetrics | None = None
    # Build Auto-Repair audit trail: every command run, every classified error,
    # every deterministic patch applied, and the pre-install dependency validation.
    commands: list[BuildCommandRecord] = Field(default_factory=list)
    repairs: list[BuildRepairAttempt] = Field(default_factory=list)
    classified_error: ClassifiedBuildErrorModel | None = None
    dependency_validation: dict[str, Any] | None = None
    # Stack Compatibility Engine output: the stack lock + matrix findings
    # (auto version fixes, lock enforcement, user-decision blocks).
    stack_compatibility: dict[str, Any] | None = None
    recovery_status: Literal["SKIPPED_AFTER_FAILURE"] | None = None
    manual_fix_guide: ManualBuildFixGuide | None = None


class GenerationValidationReport(ApiModel):
    project_id: str
    score: int
    passed: bool
    quality: dict[str, Any]
    security_findings: list[dict[str, Any]] = Field(default_factory=list)
    dependency_audit: DependencyAuditReport
    build: BuildValidationReport
    warnings: list[str] = Field(default_factory=list)
