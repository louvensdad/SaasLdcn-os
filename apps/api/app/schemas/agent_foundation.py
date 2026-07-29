from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


AgentRoleId = Literal[
    "orchestrator",
    "prompt_master",
    "architect",
    "stack_specialist",
    "frontend",
    "backend",
    "security",
    "testing",
    "gatekeeper",
    "download",
    "template",
    "ui_ux",
    "ldcn",
]


class AgentRoleDefinition(ApiModel):
    id: AgentRoleId
    label: str
    purpose: str
    input_contract: str
    output_contract: str
    boundary: str
    orchestrated_by: AgentRoleId | None = "orchestrator"
    llm_required: bool = False
    direct_actions_allowed: bool = False
    filesystem_access: Literal["none", "read_only", "orchestrated_write"] = "none"
    network_access: Literal["none", "orchestrated_only"] = "none"
    forbidden_actions: list[str] = Field(default_factory=list)
    test_coverage_id: str


class AgentFoundationStatus(ApiModel):
    mode: Literal["local_foundation"] = "local_foundation"
    external_llm_required: bool = False
    orchestrator_controls_execution: bool = True
    roles: list[AgentRoleDefinition] = Field(default_factory=list)
    phase7_required_role_ids: list[AgentRoleId] = Field(default_factory=list)
    orchestration_sequence: list[AgentRoleId] = Field(default_factory=list)
    generated_at: str