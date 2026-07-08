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


class EvidenceItem(ApiModel):
    id: str
    label: str
    available: bool
    source: Literal["marker", "file"]
    path: str | None = None  # relative path, only when source == "file"


class EngineeringKernelStatus(ApiModel):
    project_id: str
    state: CompletenessStatus
    reason: str
    override_active: bool = False
    override_reason: str | None = None
    build_verified: bool = False
    quality_gate_blocker_count: int = 0
    functional_completeness_status: CompletenessStatus | None = None
    evidence: list[EvidenceItem] = Field(default_factory=list)
    generated_at: str
