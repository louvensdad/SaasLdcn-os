from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.generation_validation import GenerationValidationReport

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


class IngestStats(ApiModel):
    """Professional pre-analysis report. Reflects the Smart Ignore Engine: the
    archive may hold hundreds of thousands of files, but only the relevant code is
    ever analyzed. Counts are derived from a single streaming pass."""

    files_found: int = 0  # every file entry in the archive/clone
    ignored_count: int = 0  # auto-ignored (node_modules/.git/build/…) + irrelevant + oversized
    analyzable_count: int = 0  # relevant code files actually indexed for the AI
    total_bytes: int = 0  # effective analyzable code size (uncompressed)
    lines_of_code: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    frameworks: list[str] = Field(default_factory=list)
    complexity: str = "unknown"
    truncated: bool = False  # analyzable cap reached; remaining relevant files were skipped

class ModernizeScoreMetric(ApiModel):
    id: str
    label: str
    value: int = Field(ge=0, le=100)
    basis: str


class ModernizeFindingSummary(ApiModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0
    info: int = 0
    total: int = 0
    technical_debt: int = 0
    duplicated_code: int = 0
    dead_code: int = 0
    dependencies: int = 0


class ModernizeDetectedTechnology(ApiModel):
    name: str
    category: str
    confidence: int = Field(ge=0, le=100)
    evidence: str


class ModernizeExecutiveSummary(ApiModel):
    overall_health: int = Field(ge=0, le=100)
    health_label: str
    modernization_estimate: str
    complexity: str
    risk_level: Literal["low", "medium", "high"]
    analysis_confidence: int = Field(ge=0, le=100)
    scores: list[ModernizeScoreMetric] = Field(default_factory=list)
    findings: ModernizeFindingSummary = Field(default_factory=ModernizeFindingSummary)
    technologies: list[ModernizeDetectedTechnology] = Field(default_factory=list)
    review: str
    priority: str

class ModernizeResponse(ApiModel):
    inventory: CodebaseInventory
    diagnosis: Diagnosis
    plan: MigrationPlan
    stats: IngestStats | None = None
    executive_summary: ModernizeExecutiveSummary | None = None


class ModernizeGenerateRequest(ApiModel):
    ingest_id: str = Field(min_length=1)
    project_name: str = "modernized-project"
    user_model_choice: str | None = None
    persist: bool = True
    use_user_key: bool = False


class ModernizeDeepAnalyzeRequest(ApiModel):
    ingest_id: str = Field(min_length=1)
    pace: bool = True  # deliberate per-stage pacing (disable for tests)


class ModernizeAskRequest(ApiModel):
    ingest_id: str = Field(min_length=1)
    question: str = Field(min_length=1, max_length=2000)
    use_user_key: bool = False
    user_model_choice: str | None = None


class ModernizeAskResponse(ApiModel):
    answer: str
    mode: Literal["llm", "deterministic"]
    grounded_on: list[str] = Field(default_factory=list)


class ModernizeRuntimeRequest(ApiModel):
    ingest_id: str = Field(min_length=1)


class RuntimeMetric(ApiModel):
    id: str
    label: str
    value: str
    # measured = computed from the real code; estimate = labeled heuristic (basis stated).
    kind: Literal["measured", "estimate"]
    basis: str


class RuntimeProfile(ApiModel):
    contractVersion: str
    runtime: str
    language: str
    container_ready: bool
    executed: bool = False  # the legacy code is NEVER executed; this stays False by design
    metrics: list[RuntimeMetric] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)


class ModernizeGenerateResponse(ApiModel):
    ok: bool
    project_id: str | None = None
    file_count: int = 0
    written: bool = False
    degraded: bool = False
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    validation_report: GenerationValidationReport | None = None


# --------------------------------------------------------------------------- #
# Modernize pipeline (deep analysis + approved auto-refactor)
# --------------------------------------------------------------------------- #

IssueSeverity = Literal["info", "low", "medium", "high", "critical"]
RiskLevel = Literal["low", "medium", "high"]
ApprovalMode = Literal["critical_only", "full", "custom"]


class ModernizeProject(ApiModel):
    project_id: str
    source: IngestSource
    file_count: int
    total_bytes: int
    skipped_count: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    created_at: str
    stats: IngestStats | None = None


class ModernizeProjectIngest(ModernizeResponse):
    """Persistent-job ingest result: the full diagnosis bundle the cockpit renders
    (inventory/diagnosis/plan/stats/executive_summary) PLUS the persistent
    project_id (== ingest_id) so Modernize can hand the analysis to Auto-Fix.
    Carries the flat project fields too for backward compatibility with the
    previous ModernizeProject response shape."""

    project_id: str
    source: IngestSource
    created_at: str
    file_count: int = 0
    total_bytes: int = 0
    skipped_count: int = 0
    languages: dict[str, int] = Field(default_factory=dict)


class LlmProviderConfig(ApiModel):
    id: Literal["openai", "anthropic", "google", "deepseek", "groq"]
    name: str
    description: str
    recommended_for: str
    key_required: bool = True
    status: Literal["ready", "initializing", "not_configured", "auth_error", "unavailable"] = "not_configured"


class LlmProviderCatalog(ApiModel):
    providers: list[LlmProviderConfig] = Field(default_factory=list)


class LlmConnectionTestRequest(ApiModel):
    provider: str


class LlmConnectionTestResult(ApiModel):
    ok: bool
    provider: str
    model: str | None = None
    # Human message; NEVER contains the key.
    message: str
    degraded: bool = False


class CodebaseScores(ApiModel):
    architecture: int = 0
    security: int = 0
    backend: int = 0
    frontend: int = 0
    database: int = 0
    tests: int = 0
    devops: int = 0
    maintainability: int = 0
    performance: int = 0
    production_readiness: int = 0
    overall: int = 0


class CodeIssue(ApiModel):
    id: str
    title: str
    severity: IssueSeverity
    category: str
    file: str | None = None
    line: int | None = None
    root_cause: str
    recommendation: str
    auto_fixable: bool = False


class ExecutiveReport(ApiModel):
    health: str
    risk_level: RiskLevel
    top_problems: list[str] = Field(default_factory=list)
    business_impact: str
    effort_estimate: str
    priority: str


class TechnicalReport(ApiModel):
    issues: list[CodeIssue] = Field(default_factory=list)


class CodebaseAnalysisReport(ApiModel):
    project_id: str
    detected_stack: str
    primary_language: str
    scores: CodebaseScores
    executive: ExecutiveReport
    technical: TechnicalReport
    degraded: bool = False  # True when no real LLM enriched the analysis
    generated_at: str


class FixAction(ApiModel):
    id: str  # auto-repair issue id when auto_fixable
    title: str
    phase_id: str
    auto_fixable: bool = False
    requires_extra_confirmation: bool = False


class ModernizationPhase(ApiModel):
    id: str  # critical | security | architecture | tests | devops
    title: str
    actions: list[FixAction] = Field(default_factory=list)


class ModernizationPlan(ApiModel):
    project_id: str
    phases: list[ModernizationPhase] = Field(default_factory=list)


class ModernizationReportResponse(ApiModel):
    report: CodebaseAnalysisReport
    plan: ModernizationPlan


class ModernizeProjectSummary(ApiModel):
    """Lightweight card for picking up an existing analysis (latest / list).
    Carries enough to render the Auto-Fix header + empty/loading states in one
    round-trip; the full report is fetched separately via /report."""

    project_id: str
    source: IngestSource
    file_count: int
    total_bytes: int = 0
    languages: dict[str, int] = Field(default_factory=dict)
    created_at: str
    updated_at: str
    has_report: bool = False
    detected_stack: str | None = None
    overall_score: int | None = None
    findings_count: int | None = None
    scores: CodebaseScores | None = None


class ApprovePlanRequest(ApiModel):
    mode: ApprovalMode = "critical_only"
    phase_ids: list[str] = Field(default_factory=list)  # used when mode == "custom"


class FixApproval(ApiModel):
    project_id: str
    approved_phase_ids: list[str] = Field(default_factory=list)


class RefactorResult(ApiModel):
    project_id: str
    materialized_project_id: str
    applied_count: int = 0
    failed_count: int = 0
    actions: list[str] = Field(default_factory=list)  # human action titles
    diff_summary: list[str] = Field(default_factory=list)  # paths only


class RevalidationReport(ApiModel):
    project_id: str
    before: CodebaseScores
    after: CodebaseScores
    deltas: dict[str, int] = Field(default_factory=dict)
    degraded: bool = False


class CodeDiffSummary(ApiModel):
    project_id: str
    changed_paths: list[str] = Field(default_factory=list)
    score_deltas: dict[str, int] = Field(default_factory=dict)


class ModernizeFlags(ApiModel):
    modernize_enabled: bool
    modernize_git_import: bool
    modernize_zip_upload: bool
    modernize_auto_refactor: bool
    modernize_user_llm_key: bool
    modernize_export: bool


class ModernizeConfigResponse(ApiModel):
    flags: ModernizeFlags
    providers: list[LlmProviderConfig] = Field(default_factory=list)
