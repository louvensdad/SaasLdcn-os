from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.generation_validation import BuildValidationReport
from app.schemas.runtime_functional_test import RuntimeFunctionalTestReport

# Exact vault lifecycle (Ciclos de vida das entidades.md -> Change Request):
# Draft -> Analyzed -> Planned -> Approved -> Applying -> Validating ->
# Accepted ou Rejected -> Rolled Back. Accepted/Rejected are terminal siblings;
# Rolled Back is reachable only from Accepted (explicit user rollback) or as an
# automatic restore path during Applying/Validating on failure (-> Rejected).
ChangeRequestStatus = Literal[
    "Draft",
    "Analyzed",
    "Planned",
    "Approved",
    "Applying",
    "Validating",
    "Accepted",
    "Rejected",
    "Rolled Back",
]

# Evolução do Blueprint policy categories.
ChangeRequestClassification = Literal["visual_only", "blueprint_version", "new_blueprint"]

OperationStatus = Literal["pending", "running", "success", "failed", "rollback"]

# Stack-Approval-Gate-style exact-phrase consent for applying a Change Request.
CONSCIOUS_APPROVAL_PHRASE = "APROVAR ALTERACAO"


class ClassificationResult(ApiModel):
    category: ChangeRequestClassification
    reason: str
    blueprint_impact: Literal["none", "version_bump", "new_blueprint"]
    degraded: bool = False


class ImpactAnalysis(ApiModel):
    affected_files: list[str] = Field(default_factory=list)
    out_of_scope_risk: list[str] = Field(default_factory=list)
    requires_backend_change: bool = False
    requires_blueprint_update: bool = False
    summary: str = ""
    degraded: bool = False


class FileDiff(ApiModel):
    path: str
    before: str | None = None
    after: str | None = None
    unified_diff: str = ""
    change_kind: Literal["added", "modified", "deleted"]


class ChangeRequestDiff(ApiModel):
    change_request_id: str
    files: list[FileDiff] = Field(default_factory=list)


class ChangeRequestApproval(ApiModel):
    status: Literal["approved"]
    approved_by: str
    approved_at: str


class ChangeRequestResult(ApiModel):
    outcome: Literal["accepted", "rejected", "rolled_back"]
    reason: str = ""
    recorded_at: str


class ChangeRequestHistoryEvent(ApiModel):
    id: str
    event: str
    actor: str
    source: str
    created_at: str
    metadata: dict[str, str | int | float | bool | None] = Field(default_factory=dict)


class ChangeRequestOperationLog(ApiModel):
    id: str
    timestamp: str
    method: str | None = None
    endpoint: str | None = None
    http_status: int | None = None
    status: OperationStatus
    message: str
    detail: str | None = None


class ChangeRequestFailureDiagnostic(ApiModel):
    status_current: str
    status_expected: list[str] = Field(default_factory=list)
    endpoint_called: str
    http_status: int
    backend_message: str
    rejection_reason: str
    correction: str
    checks: list[dict[str, Any]] = Field(default_factory=list)


class ChangeRequest(ApiModel):
    change_request_id: str
    owner_user_id: str
    workspace_id: str | None = None
    project_id: str
    room_id: str | None = None
    feature_id: str | None = None
    task_id: str | None = None
    base_version: str | None = None
    status: ChangeRequestStatus
    intent: str = ""
    classification: ClassificationResult | None = None
    scope: list[str] = Field(default_factory=list)
    impact: ImpactAnalysis | None = None
    diff: list[FileDiff] = Field(default_factory=list)
    build_result: BuildValidationReport | None = None
    preview_result: RuntimeFunctionalTestReport | dict[str, Any] | None = None
    approval: ChangeRequestApproval | None = None
    result: ChangeRequestResult | None = None
    history: list[ChangeRequestHistoryEvent] = Field(default_factory=list)
    operational_log: list[ChangeRequestOperationLog] = Field(default_factory=list)
    last_failure: ChangeRequestFailureDiagnostic | None = None
    created_at: str
    updated_at: str


class ChangeRequestSummary(ApiModel):
    change_request_id: str
    project_id: str
    status: ChangeRequestStatus
    intent: str = ""
    created_at: str
    updated_at: str


class CreateChangeRequestRequest(ApiModel):
    project_id: str = Field(min_length=1)
    room_id: str | None = None
    feature_id: str | None = None
    task_id: str | None = None
    intent: str = Field(min_length=1)
    workspace_id: str | None = None


class LlmActionRequest(ApiModel):
    user_model_choice: str | None = None
    use_user_key: bool = False


class ApproveChangeRequestRequest(ApiModel):
    confirmation: str = Field(min_length=1)


class RejectChangeRequestRequest(ApiModel):
    reason: str = Field(min_length=1)


class RollbackChangeRequestRequest(ApiModel):
    reason: str = Field(min_length=1)
