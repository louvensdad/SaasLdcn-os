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
    "go_mod_missing": "devops",
    "composer_json_missing": "devops",
    "cargo_toml_missing": "devops",
    "gemfile_missing": "devops",
    "csproj_missing": "devops",
    "gradle_kts_missing": "devops",
    "package_json_missing": "devops",
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


def _security_finding_codes(report: CodebaseAnalysisReport) -> set[str]:
    """The distinct `sec:<code>:...` finding codes present, e.g. 'sql_injection_risk'
    or 'hardcoded_password'. A single blanket "there is a security issue" boolean
    used to drive the SAME two secret-shaped actions (remove .env / rotate secrets)
    regardless of what was actually found — confirmed live: a project with only
    SQL-injection/eval/shell-injection findings (no secrets at all) still got told
    to "rotate secrets", which doesn't address any of its real issues."""
    codes: set[str] = set()
    for issue in report.technical.issues:
        if issue.category == "security" and issue.id.startswith("sec:"):
            parts = issue.id.split(":")
            if len(parts) >= 2:
                codes.add(parts[1])
    return codes


# Secret-shaped findings: these are what "remove .env / rotate secrets" actually
# addresses. Every other security code gets its own dedicated action below instead.
_SECRET_CODES = {"hardcoded_password", "generic_api_key", "aws_access_key", "private_key"}


def build_plan(report: CodebaseAnalysisReport) -> ModernizationPlan:
    scores = report.scores
    finding_codes = _security_finding_codes(report)

    phases: dict[str, list[FixAction]] = {pid: [] for pid in PHASE_TITLES}

    def add(phase: str, action_id: str, title: str, *, auto: bool, extra: bool = False) -> None:
        phases[phase].append(
            FixAction(id=action_id, title=title, phase_id=phase, auto_fixable=auto, requires_extra_confirmation=extra)
        )

    # Fase 1 — críticas
    if finding_codes & _SECRET_CODES:
        add("critical", "remove_real_env", "Remover arquivos .env/secret reais do projeto", auto=True)
        add("critical", "rotate_secrets", "Revisar e rotacionar segredos embutidos no código", auto=False, extra=True)
    if "sql_injection_risk" in finding_codes:
        add("critical", "fix_sql_injection", "Reescrever consultas SQL vulneráveis usando parâmetros (nunca concatenação/f-string)", auto=False, extra=True)
    if "shell_injection_risk" in finding_codes:
        add("critical", "fix_shell_injection", "Remover shell=True / os.system com entrada não sanitizada", auto=False, extra=True)
    if "dangerous_eval" in finding_codes:
        add("critical", "remove_dangerous_eval", "Remover eval()/exec() de entrada não confiável", auto=False, extra=True)

    # Fase 2 — segurança
    add("security", "gitignore_missing", "Adicionar .gitignore com ignores comuns", auto=True)
    if "weak_hash" in finding_codes:
        add("security", "replace_weak_hash", "Substituir hash fraco (MD5/SHA1) por bcrypt/argon2", auto=False, extra=True)
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
