from __future__ import annotations

import re
from datetime import UTC, datetime

from app.engines.codebase_analysis_engine import analyze, build_inventory
from app.schemas.modernize import (
    CodebaseAnalysisReport,
    CodebaseInventory,
    CodebaseScores,
    CodeIssue,
    Diagnosis,
    ExecutiveReport,
    TechnicalReport,
)
from app.services.codebase_ingest_service import CodebaseIngestService

# Deep analysis for Modernize: deterministic scoring + executive/technical reports
# from the (deterministic) inventory + diagnosis. A user LLM key only *enriches* the
# executive narrative (best-effort); scores/issues stay deterministic so the feature
# works offline and is testable. `degraded=True` whenever no real LLM contributed.

_SEVERITY_PENALTY = {"critical": 30, "high": 20, "medium": 10, "low": 5, "info": 0}


def _clamp(value: int) -> int:
    return max(0, min(100, int(value)))


def score_codebase(inventory: CodebaseInventory, diagnosis: Diagnosis) -> CodebaseScores:
    paths = [f.path.lower() for f in inventory.files]
    has_tests = any("test" in p or "spec" in p for p in paths)
    has_docker = any("dockerfile" in p for p in paths)
    has_ci = any(".github/workflows" in p or p.endswith(("ci.yml", "ci.yaml")) for p in paths)
    has_service = any(re.search(r"service|use[_-]?case|application", p) for p in paths)
    has_controllers = any(re.search(r"controller|route|handler", p) for p in paths)
    has_frontend = any(p.endswith((".tsx", ".jsx")) or "component" in p for p in paths)
    has_db = any("migration" in p or "schema" in p or p.endswith(".sql") for p in paths)
    has_readme = any(p == "readme.md" or p.endswith("/readme.md") for p in paths)
    has_env_example = any(".env.example" in p for p in paths)

    secret_penalty = sum(_SEVERITY_PENALTY.get(f.severity, 0) for f in diagnosis.security_findings)
    smell_codes = {s.code for s in diagnosis.smells}
    smell_count = len(diagnosis.smells)

    security = _clamp(100 - secret_penalty)
    tests = 80 if has_tests else 20
    devops = _clamp(30 + (25 if has_docker else 0) + (25 if has_ci else 0) + (20 if has_env_example else 0))
    architecture = _clamp(85 - (25 if "logic_in_controllers" in smell_codes else 0) - (0 if has_service else 10))
    backend = 80 if has_service else (55 if has_controllers else 65)
    frontend = 75 if has_frontend else 70
    database = 75 if has_db else 70
    maintainability = _clamp(80 - 8 * smell_count)
    performance = 70
    docs_bonus = 5 if has_readme else -10
    production_readiness = _clamp(
        round(security * 0.4 + tests * 0.2 + devops * 0.2 + architecture * 0.2) + docs_bonus
    )
    dims = [architecture, security, backend, frontend, database, tests, devops, maintainability, performance, production_readiness]
    overall = _clamp(round(sum(dims) / len(dims)))
    return CodebaseScores(
        architecture=architecture,
        security=security,
        backend=backend,
        frontend=frontend,
        database=database,
        tests=tests,
        devops=devops,
        maintainability=maintainability,
        performance=performance,
        production_readiness=production_readiness,
        overall=overall,
    )


def _issues(diagnosis: Diagnosis) -> list[CodeIssue]:
    issues: list[CodeIssue] = []
    for finding in diagnosis.security_findings:
        issues.append(
            CodeIssue(
                id=f"sec:{finding.code}:{finding.path}:{finding.line or 0}",
                title=finding.message,
                severity=finding.severity,
                category="security",
                file=finding.path,
                line=finding.line,
                root_cause="Credencial/segredo ou padrão inseguro encontrado no código-fonte.",
                recommendation="Mover para variável de ambiente; rotacionar o segredo; nunca commitar.",
                # Code-level secret edits are not safe to auto-apply; flagged for review.
                auto_fixable=False,
            )
        )
    for smell in diagnosis.smells:
        issues.append(
            CodeIssue(
                id=f"smell:{smell.code}",
                title=smell.message,
                severity="medium",
                category="architecture",
                file=smell.related_paths[0] if smell.related_paths else None,
                root_cause=smell.message,
                recommendation="Endereçar na fase correspondente do plano de modernização.",
                auto_fixable=False,
            )
        )
    for note in diagnosis.dependency_notes:
        if note.lower().startswith("nenhuma"):
            continue
        issues.append(
            CodeIssue(
                id=f"dep:{abs(hash(note)) % 10_000}",
                title=note,
                severity="medium",
                category="dependency",
                root_cause="Dependência legada/obsoleta detectada pela varredura heurística.",
                recommendation="Atualizar para uma versão suportada e revisar breaking changes.",
                auto_fixable=False,
            )
        )
    return issues


def _executive(scores: CodebaseScores, issues: list[CodeIssue]) -> ExecutiveReport:
    if scores.overall >= 80:
        health = "Saudável"
    elif scores.overall >= 60:
        health = "Moderado"
    else:
        health = "Frágil"

    criticals = [i for i in issues if i.severity in {"critical", "high"}]
    if criticals or scores.security < 50:
        risk: str = "high"
    elif scores.overall < 70:
        risk = "medium"
    else:
        risk = "low"

    ranked = sorted(issues, key=lambda i: list(_SEVERITY_PENALTY).index(i.severity) if i.severity in _SEVERITY_PENALTY else 99)
    top = [i.title for i in ranked[:5]] or ["Nenhum problema crítico detectado pela varredura determinística."]

    effort = "1-2 dias" if len(issues) <= 5 else ("3-5 dias" if len(issues) <= 15 else "1-2 semanas")
    return ExecutiveReport(
        health=health,
        risk_level=risk,  # type: ignore[arg-type]
        top_problems=top,
        business_impact=(
            "Riscos de segurança e dívida técnica podem causar incidentes, retrabalho e atraso de "
            "entregas. Corrigir os itens críticos reduz risco operacional e custo de manutenção."
        ),
        effort_estimate=effort,
        priority="Priorizar segurança e build, depois arquitetura, testes e DevOps.",
    )


def analyze_project(
    ingest_id: str,
    service: CodebaseIngestService,
    *,
    source: str = "zip",
    skipped: int = 0,
    api_key: str | None = None,
    user_model_choice: str | None = None,
) -> tuple[CodebaseInventory, Diagnosis, CodebaseAnalysisReport]:
    inventory = build_inventory(ingest_id, source, skipped, service)
    diagnosis = analyze(ingest_id, inventory, service)
    scores = score_codebase(inventory, diagnosis)
    issues = _issues(diagnosis)
    executive = _executive(scores, issues)
    degraded = True

    # Optional, best-effort LLM enrichment of the executive narrative.
    if api_key:
        try:
            from app.engines.llm.router import LLMRouter
            from app.schemas.llm import LLMRequest

            response = LLMRouter().route(
                LLMRequest(
                    system="You are a senior software architect. Reply with 2 concise sentences in pt-BR.",
                    user=(
                        f"Stack: {diagnosis.detected_stack}. Scores: {scores.model_dump()}. "
                        f"Principais problemas: {executive.top_problems[:3]}. "
                        "Resuma o impacto de negócio."
                    ),
                ),
                user_choice=user_model_choice,
                api_key=api_key,
            )
            if response.text and not response.served_by_fallback:
                executive.business_impact = response.text.strip()[:600]
                degraded = False
        except Exception:  # noqa: BLE001 — enrichment is best-effort; never fail analysis
            degraded = True

    report = CodebaseAnalysisReport(
        project_id=ingest_id,
        detected_stack=diagnosis.detected_stack,
        primary_language=diagnosis.primary_language,
        scores=scores,
        executive=executive,
        technical=TechnicalReport(issues=issues),
        degraded=degraded,
        generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
    return inventory, diagnosis, report


def score_root(root, service: CodebaseIngestService) -> CodebaseScores:
    """Score an already-materialized directory (used for after-refactor revalidation)."""
    reanalyze_id = service.register_root(root)
    inventory = build_inventory(reanalyze_id, "zip", 0, service)
    diagnosis = analyze(reanalyze_id, inventory, service)
    return score_codebase(inventory, diagnosis)
