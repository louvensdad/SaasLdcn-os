from __future__ import annotations

from app.schemas.modernize import (
    CodebaseAnalysisReport,
    FixAction,
    ModernizationPhase,
    ModernizationPlan,
)

# Turns an analysis report into a phased modernization plan. Auto-fixable actions
# carry the auto-repair issue id so apply-fixes can match them on the materialized
# project; advanced actions are flagged requires_extra_confirmation (never silent).

PHASE_TITLES = {
    "critical": "Fase 1 — Correções críticas",
    "security": "Fase 2 — Segurança",
    "architecture": "Fase 3 — Arquitetura",
    "tests": "Fase 4 — Testes",
    "devops": "Fase 5 — DevOps",
}

# Maps an auto-repair issue id (emitted by the Quality Gate on the materialized
# project) to the modernization phase it belongs to.
ISSUE_PHASE = {
    "real_env_file": "critical",
    "hardcoded_secret": "critical",
    "gitignore_missing": "security",
    "readme_missing": "devops",
    "readme_no_run": "devops",
    "env_example_missing": "devops",
    "package_scripts_missing": "devops",
    "health_endpoint_missing": "devops",
    "requirements_missing": "devops",
    "tsconfig_missing": "devops",
    "pom_missing": "devops",
    "src_missing": "architecture",
}


def issue_phase(issue_id: str) -> str:
    key = issue_id.split(":", 1)[0]
    if key in ISSUE_PHASE:
        return ISSUE_PHASE[key]
    if key.startswith("security") or key == "build_failed":
        return "critical"
    if key.startswith("dependency"):
        return "security"
    return "architecture"


def build_plan(report: CodebaseAnalysisReport) -> ModernizationPlan:
    scores = report.scores
    has_secret = any(i.category == "security" for i in report.technical.issues)

    phases: dict[str, list[FixAction]] = {pid: [] for pid in PHASE_TITLES}

    def add(phase: str, action_id: str, title: str, *, auto: bool, extra: bool = False) -> None:
        phases[phase].append(
            FixAction(id=action_id, title=title, phase_id=phase, auto_fixable=auto, requires_extra_confirmation=extra)
        )

    # Fase 1 — críticas
    if has_secret:
        add("critical", "remove_real_env", "Remover arquivos .env/secret reais do projeto", auto=True)
        add("critical", "rotate_secrets", "Revisar e rotacionar segredos embutidos no código", auto=False, extra=True)

    # Fase 2 — segurança
    add("security", "gitignore_missing", "Adicionar .gitignore com ignores comuns", auto=True)
    if scores.security < 70:
        add("security", "add_validation_ratelimit", "Adicionar validação de entrada e rate limiting", auto=False, extra=True)
        add("security", "fix_cors", "Corrigir CORS hardcoded e remover logs sensíveis", auto=False, extra=True)

    # Fase 3 — arquitetura
    if scores.architecture < 80:
        add("architecture", "separate_layers", "Separar camadas e remover duplicação", auto=False, extra=True)

    # Fase 4 — testes
    if scores.tests < 60:
        add("tests", "create_test_structure", "Criar estrutura inicial de testes", auto=False, extra=True)

    # Fase 5 — devops
    add("devops", "readme_missing", "Criar README com setup e execução", auto=True)
    add("devops", "env_example_missing", "Criar .env.example com placeholders seguros", auto=True)
    add("devops", "health_endpoint_missing", "Adicionar endpoint de health (quando backend)", auto=True)
    add("devops", "package_scripts_missing", "Corrigir scripts básicos do package.json", auto=True)
    if scores.devops < 60:
        add("devops", "improve_dockerfile", "Melhorar Dockerfile/CI", auto=False, extra=True)

    ordered = [
        ModernizationPhase(id=pid, title=PHASE_TITLES[pid], actions=actions)
        for pid, actions in phases.items()
        if actions
    ]
    return ModernizationPlan(project_id=report.project_id, phases=ordered)
