from __future__ import annotations

import re

from app.engines.factory_pipeline import run_factory_pipeline
from app.engines.orchestrator_engine import localization_rules
from app.schemas.modernize import (
    CodebaseInventory,
    Diagnosis,
    MigrationMapping,
    MigrationPlan,
)
from app.services.codebase_ingest_service import CodebaseIngestService
from app.services.dependency_research_service import dependency_research_service

# Architectural refactor (PASSO 3): produce a migration plan that maps every legacy
# file into a clean-architecture target WITHOUT discarding the user's business
# logic — legacy code is adapted/encapsulated, never thrown away — and (optionally)
# drive the existing API-First factory with the legacy code injected as context.

TARGET_ARCHITECTURE = "Clean Architecture (interface / application / domain / infrastructure), monólito modular"

# Heuristic layer routing by filename role. The legacy file is preserved and moved
# into the matching layer of the new backend (apps/api/...).
_LAYER_RULES: list[tuple[str, str, str]] = [
    (r"controller|routes?|handler|api", "interface", "Controller/rota → camada interface (sem regra de negócio)."),
    (r"service|use[_-]?case|usecase", "application", "Serviço → camada application (use-cases)."),
    (r"repository|repo|dao|mapper", "infrastructure", "Repositório/DAO → camada infrastructure."),
    (r"model|entity|domain|schema", "domain", "Modelo/entidade → camada domain."),
    (r"test|spec", "tests", "Teste preservado em apps/api/tests/."),
    (r"config|settings|env", "config", "Configuração → camada infrastructure/config."),
]


def build_migration_plan(inventory: CodebaseInventory, diagnosis: Diagnosis) -> MigrationPlan:
    mappings: list[MigrationMapping] = []
    for file in inventory.files:
        mappings.append(_map_file(file.path))

    steps = [
        "1. Congelar o código legado: nada é descartado; tudo é adaptado ou encapsulado.",
        f"2. Reestruturar para {TARGET_ARCHITECTURE}.",
        "3. Migrar cada arquivo para sua camada (ver mapeamentos), preservando a lógica de negócio.",
        "4. Encapsular integrações legadas atrás de interfaces na camada infrastructure.",
        "5. Adicionar/portar testes por regra de negócio e endpoint.",
        "6. Aplicar baseline de segurança OWASP e remover segredos embutidos detectados.",
    ]
    if diagnosis.security_findings:
        steps.append(
            f"7. Remediar {len(diagnosis.security_findings)} achado(s) de segurança antes do export."
        )

    return MigrationPlan(
        target_architecture=TARGET_ARCHITECTURE,
        preserved_logic_note=(
            "A lógica de negócio original é PRESERVADA: cada arquivo legado é migrado "
            "ou encapsulado na nova arquitetura, nunca descartado. A branch principal "
            "permanece intacta; a modernização ocorre em uma nova árvore."
        ),
        steps=steps,
        mappings=mappings,
    )


def _map_file(legacy_path: str) -> MigrationMapping:
    lower = legacy_path.lower()
    for pattern, layer, note in _LAYER_RULES:
        if re.search(pattern, lower):
            if layer == "tests":
                target = f"apps/api/tests/{legacy_path.rsplit('/', 1)[-1]}"
            elif layer == "config":
                target = f"apps/api/app/infrastructure/config/{legacy_path.rsplit('/', 1)[-1]}"
            else:
                target = f"apps/api/app/{layer}/{legacy_path.rsplit('/', 1)[-1]}"
            action = "adapt" if layer in {"interface", "application", "domain"} else "encapsulate"
            return MigrationMapping(legacy_path=legacy_path, target_path=target, action=action, note=note)
    # Unknown role: keep verbatim under a legacy/ holding area for manual review.
    return MigrationMapping(
        legacy_path=legacy_path,
        target_path=f"apps/api/legacy/{legacy_path}",
        action="keep",
        note="Papel não inferido: preservado em legacy/ para revisão manual.",
    )


def compile_modernization_prompt(
    ingest_id: str,
    inventory: CodebaseInventory,
    diagnosis: Diagnosis,
    plan: MigrationPlan,
    service: CodebaseIngestService,
    *,
    locale: str = "pt-BR",
    max_chars: int = 60_000,
) -> str:
    """Build a Mega-Prompt for the factory that carries the legacy code as context,
    instructing the agents to adapt/encapsulate it (never discard it)."""
    parts = [
        "# MODERNIZATION SPECIFICATION",
        f"## Detected stack\n{diagnosis.detected_stack} (primary: {diagnosis.primary_language})",
        "## Target architecture\n" + plan.target_architecture,
        "## Non-negotiable rule\n"
        "PRESERVE all original business logic. Adapt/encapsulate legacy code into the "
        "new architecture; never discard it. Apply OWASP security baseline and remove "
        "any hardcoded secrets.",
        "## Diagnosed smells\n" + "\n".join(f"- {s.code}: {s.message}" for s in diagnosis.smells),
        "## Security findings to remediate\n"
        + "\n".join(f"- [{f.severity}] {f.path}:{f.line} {f.code}" for f in diagnosis.security_findings[:50]),
        "## Migration map (legacy -> target)\n"
        + "\n".join(f"- {m.legacy_path} -> {m.target_path} ({m.action})" for m in plan.mappings[:200]),
        dependency_research_service.core_versions(type("DetectedStack", (), {
            "framework": diagnosis.detected_stack,
            "runtime": diagnosis.detected_stack,
            "language": diagnosis.primary_language,
        })()),
        localization_rules(locale),
        "## Legacy source (truncated)\n" + _legacy_snapshot(ingest_id, service, max_chars),
    ]
    return "\n\n".join(parts)


def _legacy_snapshot(ingest_id: str, service: CodebaseIngestService, max_chars: int) -> str:
    chunks: list[str] = []
    used = 0
    for rel, abs_path, _language in service.iter_files(ingest_id):
        try:
            text = abs_path.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        block = f"<<<LEGACY path=\"{rel}\">>>\n{text}\n<<<END>>>"
        if used + len(block) > max_chars:
            chunks.append("... (restante do código legado truncado para o contexto) ...")
            break
        chunks.append(block)
        used += len(block)
    return "\n".join(chunks)


def modernize_with_factory(
    ingest_id: str,
    inventory: CodebaseInventory,
    diagnosis: Diagnosis,
    plan: MigrationPlan,
    service: CodebaseIngestService,
    *,
    locale: str = "pt-BR",
    user_model_choice: str | None = None,
    api_key: str | None = None,
):
    """Run the API-First factory over the modernization Mega-Prompt. Falls back to
    the deterministic mock when no LLM is available (same as greenfield)."""
    mega = compile_modernization_prompt(ingest_id, inventory, diagnosis, plan, service, locale=locale)
    return run_factory_pipeline(mega, user_model_choice=user_model_choice, api_key=api_key)
