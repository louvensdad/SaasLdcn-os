from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.blueprint import BlueprintTechnologyGraph, ProjectBlueprint
from app.schemas.common import ApiModel
from app.schemas.gatekeeper import GatekeeperReport
from app.schemas.architectural_graph import GraphSnapshot
from app.schemas.prompt_master import PromptMasterDocument


class SaveProjectFromWizardRequest(ApiModel):
    blueprint: ProjectBlueprint
    prompt_master: PromptMasterDocument
    gatekeeper: GatekeeperReport


class ProjectUpdateRequest(ApiModel):
    project_name: str | None = Field(default=None, min_length=1)
    generated_project_path: str | None = Field(default=None, min_length=1)
    status: Literal[
        "draft",
        "blueprint_ready",
        "gatekeeper_approved",
        "ready_for_generation",
        "generation_blocked",
        "generated",
        "failed",
    ] | None = None
    readiness_status: Literal[
        "not_ready",
        "blueprint_ready",
        "ready_with_warnings",
        "ready",
        "blocked",
        "generated",
        "failed",
    ] | None = None


class ProjectRecord(ApiModel):
    project_id: str
    project_name: str
    status: Literal[
        "draft",
        "blueprint_ready",
        "gatekeeper_approved",
        "ready_for_generation",
        "generation_blocked",
        "generated",
        "failed",
    ]
    locale: str
    generation_mode: str
    technology_graph: BlueprintTechnologyGraph
    architecture_id: str
    archetype_id: str
    selected_capabilities: list[str] = Field(default_factory=list)
    selected_business_modules: list[str] = Field(default_factory=list)
    selected_endpoints: list[str] = Field(default_factory=list)
    blueprint_snapshot: ProjectBlueprint
    architectural_graph_snapshot: GraphSnapshot | None = None
    prompt_master_snapshot: PromptMasterDocument
    gatekeeper_snapshot: GatekeeperReport
    readiness_status: Literal[
        "not_ready",
        "blueprint_ready",
        "ready_with_warnings",
        "ready",
        "blocked",
        "generated",
        "failed",
    ]
    created_at: str
    updated_at: str
    contractVersion: str
    generated_project_path: str | None = None
