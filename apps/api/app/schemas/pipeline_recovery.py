from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Real pipeline failures land here through PipelineRecoveryOrchestrator
# (app.engines.pipeline_recovery_orchestrator), not through a bespoke retry
# loop per failure type. Three deterministic engines run in sequence --
# RootCauseInvestigator (read-only), CauseValidator (read-only), RepairEngineer
# (the only one allowed to mutate anything) -- exactly mirroring the existing
# QualityGateEngine -> AutoRepairEngine -> LlmRepairEngine chain in shape, but
# scoped to failures that currently bypass that chain entirely (a bare
# ProjectWriteError/ArtifactSecurityError, an architectural conflict, ...).

RecoveryState = Literal[
    "DIAGNOSIS_QUEUED", "ROOT_CAUSE_ANALYZING", "CAUSE_VALIDATING",
    "WAITING_REPAIR_APPROVAL", "REPAIRING", "REGRESSION_TESTING",
    "RESUMING", "RECOVERED", "RECOVERY_FAILED",
]

CauseClassification = Literal[
    "REAL_SECRET", "FALSE_POSITIVE", "UNSAFE_TEMPLATE", "GENERATION_CONFLICT", "UNKNOWN",
]


class Hypothesis(ApiModel):
    description: str
    confidence: float
    evidence: list[str] = Field(default_factory=list)


class RootCauseAnalysis(ApiModel):
    """Output of RootCauseInvestigator. Read-only: never mutates job state or
    generated files. See app.engines.root_cause_investigator."""

    jobId: str
    failedStage: str
    visibleError: str
    probableRootCause: str
    firstDivergencePoint: str
    affectedArtifacts: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)
    hypotheses: list[Hypothesis] = Field(default_factory=list)
    recommendedInspection: list[str] = Field(default_factory=list)


class CauseValidation(ApiModel):
    """Output of CauseValidator. Read-only: confirms or rejects the leading
    hypothesis from RootCauseAnalysis with direct evidence from the artifact
    itself. See app.engines.cause_validator."""

    confirmed: bool
    classification: CauseClassification
    triggeringContent: str = ""
    triggeringRule: str = ""
    canonicalArtifact: str = ""
    duplicateArtifacts: list[str] = Field(default_factory=list)
    safeCorrectionStrategy: str
    regressionRisk: str
    requiresApproval: bool = False


class RepairChange(ApiModel):
    file: str
    action: Literal["rewrite", "redact", "delete", "no_change_required"]
    reason: str


class RepairReport(ApiModel):
    """Output of RepairEngineer. The only one of the three agents allowed to
    mutate anything, and only after CauseValidation.confirmed is True and (if
    requiresApproval) after explicit approval. See app.engines.repair_engineer."""

    rootCause: str
    changes: list[RepairChange] = Field(default_factory=list)
    filesChanged: list[str] = Field(default_factory=list)
    testsExecuted: list[str] = Field(default_factory=list)
    testsPassed: list[str] = Field(default_factory=list)
    testsFailed: list[str] = Field(default_factory=list)
    checkpointUsed: str = ""
    resumeResult: str = ""
    remainingRisks: list[str] = Field(default_factory=list)
    snapshotId: str | None = None


class RecoveryEvent(ApiModel):
    id: str
    recoveryId: str
    jobId: str
    timestamp: str
    state: RecoveryState
    message: str
    level: Literal["info", "warning", "error"] = "info"
    detail: dict[str, Any] = Field(default_factory=dict)


class RecoveryRun(ApiModel):
    """Persisted record of one recovery attempt for one job failure. Stored as
    a job artifact (kind="recovery_run") so it survives job reloads and is
    visible in the existing artifacts list without a schema migration on
    GenerationJob itself."""

    id: str
    jobId: str
    ownerUserId: str
    state: RecoveryState
    createdAt: str
    updatedAt: str
    rootCauseAnalysis: RootCauseAnalysis | None = None
    causeValidation: CauseValidation | None = None
    repairReport: RepairReport | None = None
    events: list[RecoveryEvent] = Field(default_factory=list)
    outcome: Literal["RECOVERED", "RECOVERY_FAILED"] | None = None
    outcomeMessage: str = ""
