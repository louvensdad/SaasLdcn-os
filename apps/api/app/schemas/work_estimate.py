from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel

# Work Estimation Engine: before a GenerationJob is created, tell the user how
# big the project actually is and how long it should healthily take -- the "No
# Rush Policy" from the Engineering Employee Mode spec. Purely deterministic
# (0 LLM tokens): every signal below comes straight from the already-compiled
# ProjectSpec/blueprint, never invented.


class PhaseEstimate(ApiModel):
    id: str  # "architecture" | "backend" | "frontend" | "mobile" | "tests" | "docs" | "build"
    label: str
    duration_label: str  # "8h", "4 dias", ...


class WorkEstimate(ApiModel):
    project_name: str
    complexity: str  # "Baixa" | "Média" | "Alta" | "Enterprise"
    size_band: str  # "landing_page" | "api_simples" | "saas" | "enterprise"
    healthy_minimum_label: str  # "2-3 horas" | "1-3 dias" | "1-3 semanas" | "2-6 semanas"
    risk_level: str  # "Baixo" | "Médio" | "Alto"
    phases: list[PhaseEstimate] = Field(default_factory=list)
    drivers: list[str] = Field(default_factory=list)
    no_rush_message: str
    generated_at: str
