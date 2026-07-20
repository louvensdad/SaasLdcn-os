from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class EvolutionInsight(ApiModel):
    """Consultivo only (confirmed with the user 2026-07-20): purely
    informational, never changes model/policy routing on its own. Owner-scoped
    only: aggregates the CALLING user's own past generations, never other
    users'/workspaces'."""

    stack_signature: str
    sample_size: int
    certification_rate: float | None = None  # None when sample_size == 0
    avg_repair_cycles: float | None = None
    outcome_counts: dict[str, int] = Field(default_factory=dict)
    advisory_text: str
