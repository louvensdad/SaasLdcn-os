from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.quality_gate import QualityGateReport

RepairActionStatus = Literal["applied", "failed", "skipped"]


class RepairAction(ApiModel):
    issue_id: str
    title: str
    status: RepairActionStatus
    files_written: list[str] = Field(default_factory=list)
    files_deleted: list[str] = Field(default_factory=list)
    detail: str = ""


class RepairPlan(ApiModel):
    # The auto-fixable issues the engine intends to act on.
    project_id: str
    actions: list[str] = Field(default_factory=list)  # issue ids


class RepairResult(ApiModel):
    project_id: str
    actions: list[RepairAction] = Field(default_factory=list)
    applied_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0
    # Safe, human-readable diff summary (paths only — never file contents/secrets).
    diff_summary: list[str] = Field(default_factory=list)


class RevalidationResult(ApiModel):
    project_id: str
    report: QualityGateReport
    fixed_ids: list[str] = Field(default_factory=list)
    remaining_ids: list[str] = Field(default_factory=list)
    score_delta: int = 0


class ForceReleaseRequest(ApiModel):
    # Must equal CONSCIOUS_RELEASE_PHRASE exactly, or the route rejects it.
    confirmation: str


class ForceReleaseAudit(ApiModel):
    project_id: str
    released_by: str
    blocker_count: int
    warning_count: int
    confirmed_at: str
