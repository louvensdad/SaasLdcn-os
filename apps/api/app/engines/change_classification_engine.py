from __future__ import annotations

import unicodedata
from typing import Any

from pydantic import ValidationError

from app.engines.llm.base import LLMError
from app.engines.llm.router import LLMRouter
from app.schemas.change_request import ClassificationResult
from app.schemas.llm import LLMRequest
from app.services.ai_availability import ai_available

# Encodes the vault's "Politica de evolucao do Blueprint" literally:
#   - visual_only:       color/spacing/text/icon-only, no behavior/data/API/security/ops impact.
#   - blueprint_version:  new screen/entity/API/integration/permission/automation/tech/NFR/business-flow.
#   - new_blueprint:      module/context-boundary/tenancy/deploy-strategy/success-criteria change.
#
# Mirrors architect_engine.build_blueprint's use_llm/degraded pattern: an LLM call
# is attempted when available, but response.served_by_fallback (a MockAdapter, not
# a real judgment) is NEVER trusted for this decision -- falling through to the
# deterministic heuristic instead. The deterministic heuristic itself defaults
# UP-scope (blueprint_version) when no keyword matches at all, never silently
# assuming visual_only just because nothing else was recognized.

CHANGE_CLASSIFICATION_SYSTEM_PROMPT = """Voce e o classificador de Change Requests do MLTagente.
Dado o pedido de alteracao de um usuario sobre um projeto ja gerado, classifique-o em
EXATAMENTE uma categoria, seguindo a Politica de evolucao do Blueprint:

- "visual_only": cor, espacamento, texto, icone ou ajuste puramente visual, SEM impacto
  em comportamento, dados, API, seguranca ou operacao.
- "blueprint_version": nova tela, entidade, API, integracao, permissao, automacao,
  tecnologia, requisito nao funcional, ou alteracao de fluxo de negocio.
- "new_blueprint": mudanca de produto ou arquitetura que altera modulos, limites de
  contexto, modelo de tenancy, estrategia de deploy ou criterios de sucesso.

Na duvida, classifique para a categoria de MAIOR impacto (nunca subestime). Responda
apenas com o objeto JSON do schema fornecido."""

_NEW_BLUEPRINT_KEYWORDS = (
    "modulo", "nova arquitetura", "arquitetura do sistema", "tenancy", "multi-tenant",
    "multiplos tenants", "estrategia de deploy", "novo dominio", "limite de contexto",
    "context boundary", "modelo de tenancy", "criterios de sucesso",
)
_BLUEPRINT_VERSION_KEYWORDS = (
    "tela", "screen", "entidade", "entity", "api", "endpoint", "integracao",
    "integration", "permissao", "permission", "automacao", "automation", "tecnologia",
    "technology", "requisito nao funcional", "nonfunctional", "non-functional",
    "fluxo de negocio", "business flow", "novo campo", "campo novo", "nova rota",
    "nova pagina", "autenticacao", "authentication", "autorizacao", "authorization",
    "banco de dados", "database", "schema", "migracao", "migration", "webhook",
    "fila", "queue", "cache", "backend",
)
_VISUAL_KEYWORDS = (
    "cor", "color", "espacamento", "spacing", "icone", "icon", "fonte", "font",
    "estilo", "style", "layout", "texto", "text", "copy", "label", "tamanho", "size",
    "margem", "margin", "padding", "alinhamento", "align",
)


def _normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFKD", value or "")
    stripped = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return f" {stripped.lower()} "


def _matches(normalized: str, keywords: tuple[str, ...]) -> str | None:
    for keyword in keywords:
        if _normalize(keyword).strip() in normalized:
            return keyword
    return None


def _deterministic_classify(intent: str) -> ClassificationResult:
    normalized = _normalize(intent)

    hit = _matches(normalized, _NEW_BLUEPRINT_KEYWORDS)
    if hit:
        return ClassificationResult(
            category="new_blueprint",
            reason=f"Palavra-chave estrutural de alto impacto detectada: '{hit}'.",
            blueprint_impact="new_blueprint",
            degraded=True,
        )

    hit = _matches(normalized, _BLUEPRINT_VERSION_KEYWORDS)
    if hit:
        return ClassificationResult(
            category="blueprint_version",
            reason=f"Palavra-chave de mudanca estrutural detectada: '{hit}'.",
            blueprint_impact="version_bump",
            degraded=True,
        )

    hit = _matches(normalized, _VISUAL_KEYWORDS)
    if hit:
        return ClassificationResult(
            category="visual_only",
            reason=f"Somente palavra-chave visual detectada: '{hit}', nenhum sinal estrutural.",
            blueprint_impact="none",
            degraded=True,
        )

    return ClassificationResult(
        category="blueprint_version",
        reason="Nenhuma palavra-chave reconhecida no pedido; classificacao conservadora "
        "(up-scope) por seguranca -- nunca assumir visual_only sem evidencia.",
        blueprint_impact="version_bump",
        degraded=True,
    )


def classify_change(
    intent: str,
    *,
    spec: Any = None,
    blueprint: dict[str, Any] | None = None,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
    use_llm: bool = True,
) -> ClassificationResult:
    deterministic = _deterministic_classify(intent)
    if not use_llm or not (api_key or ai_available()):
        return deterministic

    payload: dict[str, Any] = {"intent": intent}
    if spec is not None:
        payload["product_summary"] = getattr(spec, "product_summary", None)
    if blueprint is not None:
        payload["blueprint_summary"] = {
            key: blueprint.get(key) for key in ("modules", "screens", "entities", "apis") if key in blueprint
        }

    try:
        response = (router or LLMRouter()).route(
            LLMRequest(
                system=CHANGE_CLASSIFICATION_SYSTEM_PROMPT,
                user=str(payload),
                json_schema=ClassificationResult.model_json_schema(),
            ),
            user_choice=user_model_choice,
            agent_role="change_classification",
            api_key=api_key,
        )
    except LLMError:
        return deterministic

    if response.served_by_fallback or response.parsed is None:
        return deterministic
    try:
        result = ClassificationResult.model_validate(response.parsed)
    except ValidationError:
        return deterministic
    result.degraded = False
    return result
