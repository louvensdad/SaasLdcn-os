from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel
from app.schemas.modernize import CodebaseInventory, Diagnosis

LabModuleStatus = Literal["ready", "not_configured", "unsupported"]
TerminalOutputKind = Literal["stdout", "stderr"]


class EngineeringLabModule(ApiModel):
    id: str
    label: str
    status: LabModuleStatus
    summary: str
    evidence: list[str] = Field(default_factory=list)


class EngineeringLabDependency(ApiModel):
    name: str
    version: str | None = None
    source: str


class EngineeringLabApiEndpoint(ApiModel):
    method: str
    path: str
    source: str


class EngineeringLabArchitectureNode(ApiModel):
    id: str
    label: str
    kind: str


class EngineeringLabArchitectureEdge(ApiModel):
    source: str
    target: str
    label: str


class EngineeringLabOverview(ApiModel):
    contractVersion: str
    project_id: str
    project_path: str
    project_name: str
    stack: str
    primary_language: str
    languages: dict[str, int] = Field(default_factory=dict)
    file_count: int
    line_count: int
    dependency_count: int
    dependencies: list[EngineeringLabDependency] = Field(default_factory=list)
    containers: list[str] = Field(default_factory=list)
    databases: list[str] = Field(default_factory=list)
    cloud: list[str] = Field(default_factory=list)
    build: str
    coverage: str
    status: str
    health_score: int
    last_analysis: str
    inventory: CodebaseInventory
    diagnosis: Diagnosis
    api_endpoints: list[EngineeringLabApiEndpoint] = Field(default_factory=list)
    architecture_nodes: list[EngineeringLabArchitectureNode] = Field(default_factory=list)
    architecture_edges: list[EngineeringLabArchitectureEdge] = Field(default_factory=list)
    modules: list[EngineeringLabModule] = Field(default_factory=list)


class EngineeringLabTerminalRequest(ApiModel):
    command: str = Field(min_length=1, max_length=500)
    timeout_seconds: int = Field(default=30, ge=1, le=120)


class EngineeringLabTerminalChunk(ApiModel):
    kind: TerminalOutputKind
    text: str


class EngineeringLabTerminalResponse(ApiModel):
    project_id: str
    command: str
    cwd: str
    exit_code: int
    duration_ms: int
    output: list[EngineeringLabTerminalChunk] = Field(default_factory=list)
    allowed_command: bool = True
    runtime_status: str | None = None
    sandbox_id: str | None = None
