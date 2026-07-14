from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.engineering_kernel import KernelPhase

# Delivery Decision Center: generation finishing and how the user wants the
# output delivered are independent decisions. Scoped to what's real today --
# ZIP export and Git export (GitHub/GitLab) both already exist and work
# (GeneratedProjectService / git_export_engine.py); cloud deploy, domain
# purchase, and an "Enterprise mode" do not exist anywhere in this codebase, so
# they are deliberately not represented here (no fake/disabled placeholder
# options) until they're real.

DeliveryMode = Literal["zip_only", "git_export", "zip_and_git", "ldcn_only"]


class DeliveryModeOption(ApiModel):
    mode: DeliveryMode
    label: str
    recommended: bool = False
    reason: str = ""


class DeliveryProfile(ApiModel):
    """The user's recorded delivery preference for one generated project. A
    preference, not a permission gate -- recording ldcn_only never forecloses
    exporting later; it's just what's shown/emphasized by default."""

    project_id: str
    delivery_mode: DeliveryMode
    chosen_by: str
    chosen_at: str


class DeliveryDecision(ApiModel):
    project_id: str
    kernel_phase: KernelPhase
    blocked: bool
    block_reason: str = ""
    options: list[DeliveryModeOption] = Field(default_factory=list)
    current_profile: DeliveryProfile | None = None


class RecordDeliveryDecisionRequest(ApiModel):
    delivery_mode: DeliveryMode
