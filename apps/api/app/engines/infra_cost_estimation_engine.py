from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from app.data.infra_pricing_registry import LOAD_ASSUMPTIONS, PROVIDER_PRICING, SIZE_BAND_TO_LOAD_TIER
from app.engines.llm.router import LLMRouter
from app.engines.work_estimation_engine import estimate_generation_effort
from app.schemas.infra_cost import InfraCostEstimate, LoadProfile, ProviderCostEstimate
from app.schemas.llm import LLMRequest
from app.schemas.orchestrator import ProjectSpec

# Infra Cost Estimation (vault 36 - Custos/Sistema de custos inteligentes.md).
# Scope: a one-way, pre-deploy ESTIMATE with explicit assumptions + an
# uncertainty range, comparing AWS/Azure/Railway/Render via a static pricing
# table (app/data/infra_pricing_registry.py), plus a real LLM explanation of
# cost-vs-availability/performance/lock-in tradeoffs (deterministic fallback
# when no LLM is available). Deliberately does NOT track "custo real vs
# estimado" -- see infra_pricing_registry.py's module docstring for why.

_SYSTEM_PROMPT = (
    "Você é um consultor de FinOps. Dado um resumo de um projeto de software e uma "
    "comparação de custo estimado entre provedores de nuvem, explique em português (pt-BR) "
    "os trade-offs reais entre custo, disponibilidade, desempenho e risco de lock-in. "
    "Seja direto, cite os provedores pelo nome, e termine com uma recomendação condicionada "
    "ao estágio do produto (ex: 'para um MVP early-stage, X; se crescer para produção "
    "regulada, reavalie Y'). Não invente números além dos fornecidos no contexto."
)


def estimate_load_profile(spec: ProjectSpec, blueprint: dict[str, Any] | None = None) -> LoadProfile:
    """Reuses work_estimation_engine's real, already-tested size_band scoring
    (entities/workflows/business_rules/decisions) instead of re-deriving a
    second heuristic from the same ProjectSpec signals."""
    work_estimate = estimate_generation_effort(spec, blueprint)
    tier = SIZE_BAND_TO_LOAD_TIER.get(work_estimate.size_band, "small")
    assumption = LOAD_ASSUMPTIONS[tier]
    return LoadProfile(
        tier=tier,
        size_band=work_estimate.size_band,
        monthly_active_users_label=assumption.monthly_active_users_label,
        storage_gb=assumption.storage_gb,
        monthly_traffic_gb=assumption.monthly_traffic_gb,
        uncertainty_multiplier=assumption.uncertainty_multiplier,
        assumptions=[
            f"Porte estimado a partir do ProjectSpec: '{work_estimate.size_band}' ({work_estimate.complexity}).",
            f"Uso mensal ativo assumido: {assumption.monthly_active_users_label} -- nenhum dado real de uso existe antes do lançamento.",
            f"Armazenamento e tráfego são ordens de grandeza para o porte '{tier}', não medições.",
            "Preços dos provedores são aproximados (ver app/data/infra_pricing_registry.py); confirme no console de cada provedor antes de orçar.",
        ],
    )


def estimate_provider_costs(load_profile: LoadProfile) -> list[ProviderCostEstimate]:
    results: list[ProviderCostEstimate] = []
    for pricing in PROVIDER_PRICING.values():
        compute = pricing.compute_usd_by_tier[load_profile.tier]
        storage = pricing.storage_usd_per_gb_month * load_profile.storage_gb
        egress = pricing.egress_usd_per_gb * load_profile.monthly_traffic_gb
        mid = compute + storage + egress
        low = mid / load_profile.uncertainty_multiplier
        high = mid * load_profile.uncertainty_multiplier
        results.append(
            ProviderCostEstimate(
                provider_id=pricing.provider_id, provider_name=pricing.name,
                estimated_monthly_usd_low=round(low, 2), estimated_monthly_usd_mid=round(mid, 2),
                estimated_monthly_usd_high=round(high, 2), lock_in_risk=pricing.lock_in_risk,
                tradeoffs=list(pricing.tradeoffs),
            )
        )
    results.sort(key=lambda item: item.estimated_monthly_usd_mid)
    return results


def _deterministic_explanation(estimates: list[ProviderCostEstimate]) -> str:
    """Degraded path (no LLM available): a templated summary built directly
    from the same tradeoffs data the LLM prompt would have received -- never
    a generic placeholder, always grounded in the real comparison."""
    cheapest = estimates[0]
    lines = [
        f"Estimativa determinística (sem IA). Opção de menor custo estimado: {cheapest.provider_name} "
        f"(~US$ {cheapest.estimated_monthly_usd_mid}/mês, faixa US$ {cheapest.estimated_monthly_usd_low}-{cheapest.estimated_monthly_usd_high}).",
    ]
    for item in estimates:
        lines.append(
            f"- {item.provider_name}: risco de lock-in {item.lock_in_risk}. " + " ".join(item.tradeoffs)
        )
    lines.append(
        "Recomendação genérica: para um MVP early-stage, priorize o menor custo/operação; "
        "para produção regulada ou em grande escala, reavalie considerando lock-in e maturidade operacional."
    )
    return "\n".join(lines)


def explain_tradeoffs(
    spec: ProjectSpec,
    load_profile: LoadProfile,
    estimates: list[ProviderCostEstimate],
    *,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
    use_llm: bool = True,
) -> tuple[str, bool]:
    """Returns (explanation, degraded). `degraded=True` means the deterministic
    fallback was used (no api_key/no ai_available), never disguised as an LLM
    opinion."""
    from app.services.ai_availability import ai_available

    if not use_llm or not (api_key or ai_available()):
        return _deterministic_explanation(estimates), True

    payload = {
        "product_summary": spec.product_summary,
        "delivery_type": spec.delivery_type,
        "load_profile": load_profile.model_dump(mode="json"),
        "estimates": [item.model_dump(mode="json") for item in estimates],
    }
    try:
        response = (router or LLMRouter()).route(
            LLMRequest(system=_SYSTEM_PROMPT, user=json.dumps(payload, ensure_ascii=False), max_output_tokens=800),
            user_choice=user_model_choice,
            agent_role="cost_advisor",
            api_key=api_key,
        )
    except Exception:  # noqa: BLE001 -- any provider/SDK failure degrades, never breaks the estimate
        return _deterministic_explanation(estimates), True
    if response.served_by_fallback or not response.text.strip():
        return _deterministic_explanation(estimates), True
    return response.text.strip(), False


def estimate(
    spec: ProjectSpec,
    blueprint: dict[str, Any] | None = None,
    *,
    router: LLMRouter | None = None,
    api_key: str | None = None,
    user_model_choice: str | None = None,
    use_llm: bool = True,
) -> InfraCostEstimate:
    load_profile = estimate_load_profile(spec, blueprint)
    provider_estimates = estimate_provider_costs(load_profile)
    explanation, degraded = explain_tradeoffs(
        spec, load_profile, provider_estimates,
        router=router, api_key=api_key, user_model_choice=user_model_choice, use_llm=use_llm,
    )
    return InfraCostEstimate(
        load_profile=load_profile, providers=provider_estimates, ai_explanation=explanation,
        degraded=degraded, generated_at=datetime.now(UTC).replace(microsecond=0).isoformat(),
    )
