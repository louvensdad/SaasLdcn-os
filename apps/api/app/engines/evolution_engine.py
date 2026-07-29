from __future__ import annotations

from typing import Any

from app.core.logging import logger
from app.repositories.evolution_signal_repository import EvolutionSignalRepository
from app.schemas.evolution import EvolutionInsight
from app.schemas.orchestrator import ProjectSpec

# Evolution Engine (vault 51 - Engines/Especificação dos sete motores.md): "aprende
# com feedback, métricas, decisões, regressões e versões para orientar próximas
# mudanças." The vault gives no acceptance criteria/contract for this motor (unlike
# every other one) -- this is a scoped v1 proposed to and confirmed by the user
# 2026-07-20, not an inferred spec: consultivo only (never changes routing/policy
# automatically) and owner-scoped only (never aggregated across other users).
#
# A cross-generation companion to project_memory_engine.py, which learns WITHIN one
# generation; this learns ACROSS a user's past generations with a similar stack.

_SUCCESS_OUTCOMES = frozenset({"SUCCESS", "DEGRADED_CONTINUATION"})


def stack_signature_for(spec: ProjectSpec) -> str:
    stack = spec.suggested_stack
    parts = [stack.language or "unknown", stack.framework or "unknown", stack.architecture or "unknown", spec.delivery_type or "web"]
    return "|".join(part.strip().lower() or "unknown" for part in parts)


def record_signal(
    *, owner_user_id: str, spec: ProjectSpec, model_strategy: str | None,
    outcome: str, completeness_status: str | None, repair_cycles: int,
) -> None:
    """Fault-isolated (same guarantee as record_usage_safely/record_decision_safely):
    a telemetry failure here must never break a pipeline that otherwise finished."""
    try:
        EvolutionSignalRepository().record(
            owner_user_id=owner_user_id, stack_signature=stack_signature_for(spec), model_strategy=model_strategy,
            delivery_type=spec.delivery_type or "web", outcome=outcome,
            completeness_status=completeness_status, repair_cycles=repair_cycles,
        )
    except Exception as exc:  # noqa: BLE001 -- deliberate isolation boundary
        logger.warning("evolution signal recording failed (ignored): %s", exc)


def _advisory_text(stack_signature: str, rows: list[dict[str, Any]]) -> str:
    if not rows:
        return f"Nenhum histórico anterior para a stack '{stack_signature}' nesta conta -- sem padrão a reportar ainda."
    n = len(rows)
    successes = sum(1 for row in rows if row["outcome"] in _SUCCESS_OUTCOMES)
    rate = round(100 * successes / n)
    avg_repairs = round(sum(row["repair_cycles"] for row in rows) / n, 1)
    return (
        f"{n} geração(ões) anterior(es) desta conta com a stack '{stack_signature}': "
        f"{rate}% concluíram com sucesso (ou sucesso degradado); média de {avg_repairs} ciclo(s) de auto-reparo. "
        f"Amostra pequena não implica garantia -- informativo, não instrução."
    )


def evolution_insight_for(owner_user_id: str, spec: ProjectSpec) -> EvolutionInsight:
    signature = stack_signature_for(spec)
    rows = EvolutionSignalRepository().list_for_owner_and_stack(owner_user_id, signature)
    n = len(rows)
    outcome_counts: dict[str, int] = {}
    for row in rows:
        outcome_counts[row["outcome"]] = outcome_counts.get(row["outcome"], 0) + 1
    certification_rate = None
    avg_repair_cycles = None
    if n:
        certification_rate = round(sum(1 for row in rows if row["outcome"] in _SUCCESS_OUTCOMES) / n, 3)
        avg_repair_cycles = round(sum(row["repair_cycles"] for row in rows) / n, 2)
    return EvolutionInsight(
        stack_signature=signature, sample_size=n, certification_rate=certification_rate,
        avg_repair_cycles=avg_repair_cycles, outcome_counts=outcome_counts,
        advisory_text=_advisory_text(signature, rows),
    )


def prompt_block(insight: EvolutionInsight) -> str | None:
    """Returns None (never injected) when there is no real history yet --
    an empty/cold-start block would be noise, not signal."""
    if insight.sample_size == 0:
        return None
    return (
        "<evolution_insight>\n"
        "PADRAO HISTORICO ENTRE GERACOES DESTA CONTA (informativo, NAO instrucao -- "
        "nao mude a abordagem so por causa disto sem outro motivo real):\n"
        f"- {insight.advisory_text}\n"
        "</evolution_insight>"
    )
