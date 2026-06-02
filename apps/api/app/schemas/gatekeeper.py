from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.blueprint import ProjectBlueprint
from app.schemas.common import ApiModel
from app.schemas.prompt_master import PromptMasterDocument


class GatekeeperPreviewRequest(ApiModel):
    blueprint: ProjectBlueprint
    prompt_master: PromptMasterDocument


class GatekeeperCheck(ApiModel):
    id: Literal[
        "technology_graph_check",
        "architecture_compatibility_check",
        "business_module_check",
        "endpoint_plan_check",
        "capability_dependency_check",
        "engineering_readiness_check",
        "security_baseline_check",
        "testing_baseline_check",
        "documentation_baseline_check",
        "generation_constraint_check",
        "locale_i18n_check",
        "secret_exposure_check",
        "trace_safety_check",
    ]
    title: str
    status: Literal["passed", "warning", "failed"]
    severity: Literal["info", "warning", "critical"]
    summary: str
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    related_item_ids: list[str] = Field(default_factory=list)


class GatekeeperTrace(ApiModel):
    blueprint_id: str
    prompt_master_id: str
    check_ids: list[str] = Field(default_factory=list)
    redacted_fields: list[str] = Field(default_factory=list)
    contains_secrets: bool


class GatekeeperReport(ApiModel):
    gatekeeper_report_id: str
    blueprint_id: str
    prompt_master_id: str
    decision: Literal["approved", "approved_with_warnings", "blocked"]
    summary: str
    blockers: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    checks: list[GatekeeperCheck] = Field(default_factory=list)
    trace: GatekeeperTrace
    generated_at: str
