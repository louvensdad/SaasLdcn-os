from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.orchestrator import ProjectSpec
from app.schemas.generation_validation import ManualBuildFixGuide
from app.schemas.functional_completeness import CompletenessStatus
from app.schemas.work_estimate import WorkEstimate
from app.schemas.execution_plan import ExecutionPlan


GenerationJobStatus = Literal[
    "QUEUED", "PREPARING_CONTEXT", "CONTRACTS_PLANNING", "CONTRACTS_GENERATING",
    "CONTRACTS_VALIDATING", "BACKEND_PLANNING", "BACKEND_GENERATING",
    "BACKEND_VALIDATING", "FRONTEND_PLANNING", "FRONTEND_GENERATING",
    "FRONTEND_VALIDATING", "MOBILE_PLANNING", "MOBILE_GENERATING",
    "MOBILE_VALIDATING", "DATABASE_PLANNING", "DATABASE_GENERATING",
    "DATABASE_VALIDATING", "SECURITY_PLANNING", "SECURITY_VALIDATING",
    "TESTS_GENERATING", "TESTS_RUNNING", "DOCUMENTATION_GENERATING",
    "BUILD_RUNNING", "PACKAGE_CREATING", "READY", "FAILED", "PAUSED",
    "NEEDS_USER_ACTION", "STALLED",
]

StageStatus = Literal["waiting", "running", "success", "failed", "skipped", "retrying", "stalled"]


class GenerationArtifact(ApiModel):
    id: str
    stage: str
    name: str
    kind: str
    path: str
    size_bytes: int
    checksum: str
    valid: bool = False
    warnings: list[str] = Field(default_factory=list)
    created_at: str


class GenerationCheckpoint(ApiModel):
    id: str
    stage: str
    chunk: str | None = None
    status: StageStatus
    attempt: int = 1
    artifact_ids: list[str] = Field(default_factory=list)
    payload_bytes: int = 0
    estimated_tokens: int = 0
    parser: str | None = None
    validator: str | None = None
    partitioned: bool = False
    started_at: str
    finished_at: str | None = None
    detail: str = ""


class GenerationJobLog(ApiModel):
    id: str
    timestamp: str
    stage: str
    level: Literal["info", "warning", "error"] = "info"
    message: str
    detail: str | None = None


ExecutionEventType = Literal[
    "stage_started", "stage_finished", "command_started", "command_output",
    "command_finished", "command_skipped", "artifact_written", "agent_started",
    "agent_finished", "error", "stalled", "timeout", "info",
    # Build Auto-Repair timeline: a classified error was detected, a deterministic
    # patch was applied (or none was safe) and the failing command re-ran.
    "repair_started", "repair_applied", "repair_failed",
    # Execution Reality Guard: an LLM response contradicted the Ground Truth
    # state (fabricated repo/deploy claims) and was rejected/sanitized.
    "reality_guard",
    # PIPELINE_FINAL_EVENT: emitted by the State Transition Finalizer on EVERY
    # terminal outcome (SUCCESS / DEGRADED_CONTINUATION / NEEDS_USER_ACTION /
    # STALLED / FAILED) — even when the build failed or was skipped.
    "pipeline_complete",
]


class GenerationExecutionEvent(ApiModel):
    """A fine-grained, real-time execution event for the live console: which command
    ran, in which directory, its stdout/stderr, how long it took, the exit code, and
    which stage/step produced it. Streamed over the existing job SSE."""

    id: str
    jobId: str
    timestamp: str
    stage: str
    type: ExecutionEventType
    level: Literal["info", "warning", "error"] = "info"
    message: str
    command: str | None = None
    cwd: str | None = None
    durationMs: int | None = None
    stream: Literal["stdout", "stderr"] | None = None
    stdout: str | None = None
    stderr: str | None = None
    artifactPath: str | None = None
    exitCode: int | None = None


class GenerationJobError(ApiModel):
    stage: str
    agent: str
    provider: str | None = None
    model: str | None = None
    http_status: int | None = None
    payload_size: int = 0
    token_estimate: int = 0
    parser: str | None = None
    validator: str | None = None
    attempt: int = 0
    raw_response_path: str | None = None
    artifacts_preserved: list[str] = Field(default_factory=list)
    recommended_action: str
    message: str
    # Mandatory stall/failure diagnostic context (why the transition did not happen).
    kind: Literal["failure", "stall"] = "failure"
    reason: str = ""
    elapsed_seconds: int = 0
    timeout_seconds: int | None = None
    last_log: str | None = None
    next_expected_transition: str | None = None
    warning_count: int = 0
    error_count: int = 0
    blocking_count: int = 0
    warning_breakdown: dict[str, int] = Field(default_factory=dict)
    last_successful_checkpoint: str | None = None
    last_generated_artifact: str | None = None
    can_continue_with_warnings: bool = False


class GenerationJob(ApiModel):
    id: str
    projectId: str
    generatedProjectId: str | None = None
    workspaceId: str | None = None
    sourceMissionId: str | None = None
    status: GenerationJobStatus
    currentStage: str
    provider: str | None = None
    providerLabel: str = "Nenhum"
    model: str | None = None
    blueprintVersion: int = 0
    startedAt: str
    finishedAt: str | None = None
    progress: int = 0
    error: GenerationJobError | None = None
    retryCount: int = 0
    buildStatus: Literal["PENDING", "RUNNING", "PASSED", "SKIPPED_AFTER_FAILURE"] = "PENDING"
    buildAttempts: int = 0
    manualBuildRetryCount: int = 0
    buildSkipAcknowledged: bool = False
    manualBuildFixGuide: ManualBuildFixGuide | None = None
    # Functional Completeness Gate verdict (audit 2026-07-07/08): build passing
    # alone never implies VERIFIED -- see FunctionalCompletenessReport. None until
    # the job reaches READY and the gate has actually run.
    completenessStatus: CompletenessStatus | None = None
    # Work Estimation Engine (No Rush Policy): sized once at job creation from the
    # real ProjectSpec/blueprint, so the job never appears to promise an instant
    # result. See work_estimation_engine.estimate_generation_effort.
    workEstimate: WorkEstimate | None = None
    # Execution Plan Engine: objective/input/output/risk/approval-criteria per real
    # pipeline stage, computed once at job creation from the same stage list
    # stageStatuses already uses -- see execution_plan_engine.build_execution_plan.
    executionPlan: ExecutionPlan | None = None
    stackLock: dict[str, Any] | None = None
    artifacts: list[GenerationArtifact] = Field(default_factory=list)
    logs: list[GenerationJobLog] = Field(default_factory=list)
    events: list[GenerationExecutionEvent] = Field(default_factory=list)
    checkpoints: list[GenerationCheckpoint] = Field(default_factory=list)
    stageStatuses: dict[str, StageStatus] = Field(default_factory=dict)
    projectName: str
    partial: bool = True
    valid: bool = False
    packageReady: bool = False
    inputTokensTotal: int = 0
    outputTokensTotal: int = 0
    resultPath: str | None = None
    createdAt: str
    updatedAt: str
    archived: bool = False


class GenerationJobSummary(ApiModel):
    """Lightweight row for the jobs list/history screen — a full GenerationJob
    can carry hundreds of artifacts; the list view never needs them."""

    id: str
    projectId: str
    generatedProjectId: str | None = None
    projectName: str
    status: GenerationJobStatus
    currentStage: str
    provider: str | None = None
    providerLabel: str = "Nenhum"
    model: str | None = None
    progress: int = 0
    retryCount: int = 0
    valid: bool = False
    packageReady: bool = False
    buildStatus: Literal["PENDING", "RUNNING", "PASSED", "SKIPPED_AFTER_FAILURE"] = "PENDING"
    archived: bool = False
    createdAt: str
    updatedAt: str
    startedAt: str
    finishedAt: str | None = None


class SetJobArchivedRequest(ApiModel):
    archived: bool


class UsageByModel(ApiModel):
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    job_count: int = 0


class GenerationUsageSummary(ApiModel):
    """Measured token usage for one user over a period, for cost attribution /
    billing (audit B4/AI2). Real totals accumulated per job during generation."""

    period_days: int
    since: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    job_count: int = 0
    by_model: list[UsageByModel] = Field(default_factory=list)


class CreateGenerationJobRequest(ApiModel):
    projectId: str
    workspaceId: str | None = None
    projectName: str
    spec: ProjectSpec
    blueprint: dict[str, Any]
    blueprintVersion: int = 0
    mode: Literal["llm", "deterministic"] = "llm"
    user_model_choice: str | None = None
    use_user_key: bool = False


class RetryGenerationStageRequest(ApiModel):
    mode: Literal["normal", "partitioned", "deterministic"] = "normal"
    user_model_choice: str | None = None
    use_user_key: bool = False
