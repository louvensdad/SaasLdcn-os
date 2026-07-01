from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel

# The Architect Engine's output: PromptMaster/ProjectSpec -> a justified architecture.
# Distinct from the wizard's registry `ProjectBlueprint` (blueprint_engine.py).

BLUEPRINT_AREAS = [
    "frontend",
    "backend",
    "database",
    "auth",
    "authorization",
    "apis",
    "integrations",
    "observability",
    "tests",
    "deploy",
]


class BlueprintDecision(ApiModel):
    area: str
    choice: str
    justification: str
    alternatives_considered: list[str] = Field(default_factory=list)
    # Deep engineering rationale. Optional so older blueprints / minimal LLM
    # outputs still validate; populated by the deterministic engine and requested
    # from the LLM. Empty means "not stated" — never invented to look fuller.
    tradeoffs: list[str] = Field(default_factory=list)
    impact: str = ""
    risks: list[str] = Field(default_factory=list)
    when_to_reconsider: str = ""
    dependencies: list[str] = Field(default_factory=list)
    requirement_links: list[str] = Field(default_factory=list)
    # Per-decision confidence (0..1) computed from real signal strength (cited
    # requirements, alternatives weighed, NFR coverage, area criticality) — never an
    # invented number. confidence_basis states what drove it.
    confidence: float = 0.0
    confidence_basis: str = ""
    context: str = ""
    # Dimension-specific impacts. cost_impact is a QUALITATIVE band (Baixo/Médio/Alto),
    # explicitly non-monetary; empty means "not stated".
    scalability_impact: str = ""
    security_impact: str = ""
    cost_impact: str = ""
    maintainability_impact: str = ""
    evidence: list[str] = Field(default_factory=list)


class ArchitectureBlueprint(ApiModel):
    project_id: str
    decisions: list[BlueprintDecision] = Field(default_factory=list)
    degraded: bool = False  # True when no real LLM authored the blueprint
    generated_at: str
    provider: str | None = None
    providerLabel: str = "Nenhum"
    mode: Literal["llm", "deterministic"] = "deterministic"
    model: str = "Motor deterministico"
    source: Literal["llm", "deterministic"] = "deterministic"
    version: int = 0
    generatedAt: str = ""
    tokensUsed: int = 0
    latencyMs: int = 0
    generatedBy: str = "architect_engine"
    llmMetadata: dict[str, str | int | bool | None] = Field(default_factory=dict)
    origin: str = "LDCN deterministic preview"
    confidence: float = 0.0
    llm_model: str | None = None
    generation_time_ms: int = 0
    tokens: dict[str, int] = Field(default_factory=dict)
    fallback: bool = False
    # Set when the user consciously accepts a degraded (deterministic) preview to
    # move past Engineering Review. Reset to False whenever a new blueprint is
    # generated. See ProjectRoomService.acknowledge_preview.
    preview_acknowledged: bool = False
    # Resilient-pipeline diagnostics (Phases 7/8): what the provider returned and
    # how it was parsed/normalized/repaired. Lets the UI show the raw response,
    # the normalized blueprint, and any partial-recovery reason. Secrets redacted.
    responseDiagnostics: dict[str, Any] | None = None
