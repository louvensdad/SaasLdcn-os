from __future__ import annotations

from typing import Any

from pydantic import ValidationError

from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.change_request import ClassificationResult, ImpactAnalysis
from app.schemas.llm import LLMRequest
from app.services.ai_availability import ai_available
from app.services.generated_project_service import GeneratedProjectService

# Determines the minimal set of files a Change Request should touch, and the
# literal implementation of the vault's "changing the button color must not
# touch the backend without justification" acceptance criterion: `requires_
# backend_change` is a real signal the orchestrator cross-checks against the
# classification's category before letting a "visual_only" CR proceed.
#
# Deterministic fallback is intentionally NOT a fuzzy filename/keyword guesser:
# guessing which of a project's files map to an arbitrary natural-language
# request needs real reasoning, and a wrong deterministic guess (a false
# "no backend impact") would be worse than admitting the gap. Without an LLM,
# this engine fails CLOSED -- empty scope, requires_backend_change=True,
# degraded=True -- so the orchestrator blocks progression and a human must
# either configure an LLM provider or supply scope manually, rather than the
# platform silently proceeding on a guess it cannot justify.

_MAX_LISTED_PATHS = 400

CHANGE_IMPACT_SYSTEM_PROMPT = """Voce e o analisador de impacto de Change Requests do MLTagente.
Dado o pedido de alteracao, a classificacao ja decidida, e a lista de arquivos reais
do projeto gerado, determine:
- affected_files: a lista MINIMA de caminhos (deste projeto, EXATAMENTE como aparecem
  na lista fornecida) que precisam mudar para atender ao pedido. Nunca invente caminhos.
- requires_backend_change: true se algum arquivo afetado for de backend/API/dados.
- requires_blueprint_update: true se a mudanca exigir atualizar o Blueprint (nao for
  puramente visual).
- out_of_scope_risk: arquivos que poderiam ser tocados por engano mas devem ficar de fora.
- summary: resumo curto e direto do impacto.

Responda apenas com o objeto JSON do schema fornecido."""


def _deterministic_impact(classification: ClassificationResult) -> ImpactAnalysis:
    return ImpactAnalysis(
        affected_files=[],
        out_of_scope_risk=[],
        requires_backend_change=True,
        requires_blueprint_update=classification.category != "visual_only",
        summary=(
            "Analise de impacto degradada: nenhum provedor de IA disponivel para "
            "determinar os arquivos afetados com seguranca. Escopo vazio -- revisao "
            "manual ou configuracao de um provedor de IA e necessaria antes de planejar "
            "este Change Request."
        ),
        degraded=True,
    )


def analyze_impact(
    project: dict[str, Any],
    intent: str,
    classification: ClassificationResult,
    *,
    files_service: GeneratedProjectService | None = None,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
    use_llm: bool = True,
    project_id: str | None = None,
) -> ImpactAnalysis:
    files_service = files_service or GeneratedProjectService()
    listing = files_service.list_files(project)
    all_paths = sorted(entry["relative_path"] for entry in listing.get("files", []))

    if not use_llm or not (api_key or ai_available()):
        return _deterministic_impact(classification)

    payload = {
        "intent": intent,
        "classification": classification.model_dump(),
        "project_files": all_paths[:_MAX_LISTED_PATHS],
        "truncated": len(all_paths) > _MAX_LISTED_PATHS,
    }

    try:
        response = (router or LLMRouter()).route(
            LLMRequest(
                system=CHANGE_IMPACT_SYSTEM_PROMPT,
                user=str(payload),
                json_schema=ImpactAnalysis.model_json_schema(),
            ),
            user_choice=user_model_choice,
            agent_role="change_impact",
            api_key=api_key,
            project_id=project_id,
        )
    except LLMError:
        return _deterministic_impact(classification)

    if response.served_by_fallback or response.parsed is None:
        return _deterministic_impact(classification)
    try:
        result = ImpactAnalysis.model_validate(response.parsed)
    except ValidationError:
        return _deterministic_impact(classification)

    valid_paths = set(all_paths)
    result.affected_files = [path for path in result.affected_files if path in valid_paths]
    result.out_of_scope_risk = [path for path in result.out_of_scope_risk if path in valid_paths]
    result.degraded = False
    if not result.affected_files:
        # The LLM ran but found nothing real to touch -- still fail closed rather
        # than let plan() freeze an empty scope silently.
        result.requires_backend_change = True
        result.summary = result.summary or "Nenhum arquivo real correspondeu ao pedido."
    return result
