from __future__ import annotations

from app.schemas.common import ApiModel
from app.schemas.mission import MissionCategory, SpecialistRole

# Thin backend mirror of the Mission Workspace registry. The rich, UI-facing
# genome (steps, fields, AI action prompt templates, gap/risk rule predicates)
# lives in TypeScript at apps/web/modules/mission-workspace/registry -- that
# is the single source of truth for authoring mission content. The backend
# only needs enough to label a mission for prompt-building context
# (specialist system prompts, artifact titles) and to validate a mission_type
# on creation.


class MissionSummary(ApiModel):
    id: str
    category: MissionCategory
    title: str
    specialists: list[SpecialistRole]


MISSION_SUMMARIES: dict[str, MissionSummary] = {
    "software.build": MissionSummary(
        id="software.build", category="create", title="Criar software",
        specialists=["software_architect", "backend_engineer", "database_engineer", "security_engineer", "qa_engineer", "devops_engineer"],
    ),
    "project.analyze": MissionSummary(
        id="project.analyze", category="analyze", title="Analisar projeto ou código existente",
        specialists=["performance_analyst", "security_auditor", "risk_analyst"],
    ),
    "automation.create": MissionSummary(
        id="automation.create", category="create", title="Criar automação ou workflow",
        specialists=["automation_architect", "integration_specialist"],
    ),
    "error.diagnose": MissionSummary(
        id="error.diagnose", category="fix", title="Diagnosticar erro",
        specialists=["backend_engineer", "security_engineer", "devops_engineer"],
    ),
    "system.modernize": MissionSummary(
        id="system.modernize", category="evolve", title="Modernizar sistema legado",
        specialists=["software_architect", "devops_engineer", "risk_analyst"],
    ),
    "project.plan": MissionSummary(
        id="project.plan", category="plan", title="Planejar projeto e roadmap",
        specialists=["product_strategist", "risk_analyst"],
    ),
    "architecture.review": MissionSummary(
        id="architecture.review", category="analyze", title="Revisar arquitetura",
        specialists=["software_architect", "security_engineer", "performance_analyst"],
    ),
    "documentation.create": MissionSummary(
        id="documentation.create", category="create", title="Criar documentação técnica",
        specialists=["technical_writer"],
    ),
}

_EXPANDED_SUMMARIES: tuple[tuple[str, MissionCategory, str, list[SpecialistRole]], ...] = (
    ("agent.create", "create", "Criar agente de IA", ["software_architect", "backend_engineer", "security_engineer"]),
    ("integration.create", "create", "Criar integração", ["integration_specialist", "backend_engineer", "security_engineer"]),
    ("security.audit", "analyze", "Auditar segurança", ["security_auditor", "security_engineer", "risk_analyst"]),
    ("data.analyze", "analyze", "Analisar dados ou documento", ["data_analyst", "risk_analyst"]),
    ("performance.analyze", "analyze", "Analisar performance", ["performance_analyst", "backend_engineer", "database_engineer", "devops_engineer"]),
    ("build.fix", "fix", "Corrigir build ou deploy", ["devops_engineer", "backend_engineer", "qa_engineer"]),
    ("security.fix", "fix", "Corrigir vulnerabilidade", ["security_engineer", "security_auditor", "qa_engineer"]),
    ("performance.fix", "fix", "Corrigir performance", ["performance_analyst", "backend_engineer", "database_engineer"]),
    ("tech.migrate", "evolve", "Migrar tecnologia", ["software_architect", "backend_engineer", "devops_engineer", "risk_analyst"]),
    ("code.refactor", "evolve", "Refatorar código", ["software_architect", "backend_engineer", "qa_engineer"]),
    ("system.scale", "evolve", "Escalar sistema", ["software_architect", "performance_analyst", "database_engineer", "devops_engineer"]),
    ("sprint.plan", "plan", "Planejar sprint ou roadmap", ["product_strategist", "risk_analyst"]),
    ("infrastructure.plan", "plan", "Planejar infraestrutura", ["devops_engineer", "security_engineer", "software_architect"]),
    ("tech.research", "research", "Pesquisar tecnologia", ["software_architect", "risk_analyst"]),
    ("solutions.compare", "research", "Comparar soluções", ["software_architect", "risk_analyst", "product_strategist"]),
    ("feasibility.study", "research", "Estudar viabilidade", ["software_architect", "product_strategist", "risk_analyst"]),
)
MISSION_SUMMARIES.update({
    mission_id: MissionSummary(id=mission_id, category=category, title=title, specialists=specialists)
    for mission_id, category, title, specialists in _EXPANDED_SUMMARIES
})

MVP_MISSION_TYPES = tuple(MISSION_SUMMARIES.keys())


class UnknownMissionTypeError(ValueError):
    pass


def resolve_mission_summary(mission_type: str) -> MissionSummary:
    summary = MISSION_SUMMARIES.get(mission_type)
    if summary is None:
        raise UnknownMissionTypeError(f"Tipo de missão desconhecido: {mission_type!r}.")
    return summary


def list_mission_summaries() -> list[MissionSummary]:
    return list(MISSION_SUMMARIES.values())
