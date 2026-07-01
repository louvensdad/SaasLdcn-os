from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel

# Structured, DETERMINISTIC architecture views derived from the ProjectSpec + the
# Architect's blueprint. Every field is grounded in real spec/blueprint data; when
# there is no evidence the list/strategy is empty and the UI says so — nothing is
# invented. This is the honest, non-graphical complement to a full C4 model.


class FlowNode(ApiModel):
    id: str
    label: str
    kind: str = "node"  # actor | layer | store | external | node


class FlowEdge(ApiModel):
    from_id: str
    to_id: str
    label: str = ""


class ContextDiagram(ApiModel):
    nodes: list[FlowNode] = Field(default_factory=list)
    edges: list[FlowEdge] = Field(default_factory=list)


class BoundedContext(ApiModel):
    name: str
    responsibility: str
    entities: list[str] = Field(default_factory=list)
    relationships: list[str] = Field(default_factory=list)
    evidence: str = ""


class FlowStep(ApiModel):
    step: str
    detail: str = ""


class ModuleDependency(ApiModel):
    module: str
    depends_on: list[str] = Field(default_factory=list)


class Strategy(ApiModel):
    """A strategy panel that is either available (with real content) or honestly
    unavailable (`available=False`) — never a fabricated recommendation."""

    available: bool = False
    summary: str = ""
    items: list[str] = Field(default_factory=list)


class DisasterRecovery(ApiModel):
    available: bool = False
    backup: str = ""
    restore: str = ""
    rto: str = ""
    rpo: str = ""
    replication: str = ""


class ArchitectureModel(ApiModel):
    deterministic: bool = True  # these views are rule-derived (no LLM)
    context_diagram: ContextDiagram = Field(default_factory=ContextDiagram)
    bounded_contexts: list[BoundedContext] = Field(default_factory=list)
    data_flow: list[FlowStep] = Field(default_factory=list)
    auth_flow: list[FlowStep] = Field(default_factory=list)
    dependencies: list[ModuleDependency] = Field(default_factory=list)
    events: Strategy = Field(default_factory=Strategy)
    cache_strategy: Strategy = Field(default_factory=Strategy)
    deploy_strategy: Strategy = Field(default_factory=Strategy)
    disaster_recovery: DisasterRecovery = Field(default_factory=DisasterRecovery)
