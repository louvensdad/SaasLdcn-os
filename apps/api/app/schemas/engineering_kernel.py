from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.functional_completeness import CompletenessStatus

# Engineering Kernel (Engineering Employee Mode, section 5): a single, queryable
# source of truth for "what state is this project actually in," instead of every
# caller re-deriving the same precedence over ProjectWriter.read_verification /
# read_functional_completeness / quality_gate_engine.evaluate independently.
# Reuses the exact 4-state vocabulary the Functional Completeness Gate already
# established -- this is a consolidation of already-computed signals, not a new
# judgment. Paired with an Evidence Store index (section 6): every claim here is
# backed by a real, checkable artifact -- unavailable evidence stays listed as
# unavailable, never omitted.


# Unified Kernel phase (Engineering Policy gap #7): the policy wants one 9-state
# machine (DRAFT/APPROVED/GENERATING/ANALYZING/REPAIRING/TESTING/CERTIFIED/
# PARTIALLY_VERIFIED/BLOCKED); the codebase actually has 4 unrelated vocabularies
# (ProjectRoomStatus, StackApproval.status, GenerationJobStatus, CompletenessStatus).
# This derives 7 of the 9 states here -- DRAFT/APPROVED are excluded on purpose:
# compute_kernel_status() only ever runs against a project that already has a
# materialized generated_project_id/directory, so it never sees a Project Room
# before generation starts. Those two already live honestly on
# ProjectRoomWorkflow.status; faking them here would mean guessing a Room to
# attach to a bare generated-project id that might not even have one (e.g.
# Modernize/Auto-Fix output). NEEDS_HUMAN_REVIEW is kept as a 5th terminal value
# beyond the policy's list -- collapsing it into BLOCKED or CERTIFIED would hide
# the same honest distinction CompletenessStatus already makes.
KernelPhase = Literal[
    "GENERATING", "ANALYZING", "TESTING", "REPAIRING",
    "CERTIFIED", "PARTIALLY_VERIFIED", "BLOCKED", "NEEDS_HUMAN_REVIEW",
]


class EvidenceItem(ApiModel):
    id: str
    label: str
    available: bool
    source: Literal["marker", "file"]
    path: str | None = None  # relative path, only when source == "file"


class EngineeringKernelStatus(ApiModel):
    project_id: str
    state: CompletenessStatus
    kernel_phase: KernelPhase
    reason: str
    override_active: bool = False
    override_reason: str | None = None
    # Distinct from override_active/override_reason: a narrower, honest
    # acknowledgment for NEEDS_HUMAN_REVIEW ("we couldn't auto-verify this")
    # rather than the heavier "liberar com risco" override meant for BLOCKED
    # ("this has a real structural defect"). Never fakes state == VERIFIED.
    human_review_acknowledged: bool = False
    human_review_reason: str | None = None
    build_verified: bool = False
    quality_gate_blocker_count: int = 0
    functional_completeness_status: CompletenessStatus | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)
    generated_at: str


class AcknowledgeHumanReviewRequest(ApiModel):
    confirmation: str  # must equal CONSCIOUS_HUMAN_REVIEW_PHRASE exactly
