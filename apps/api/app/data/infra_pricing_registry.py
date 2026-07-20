from __future__ import annotations

from dataclasses import dataclass

# Infra Cost Estimation (vault 36 - Custos/Sistema de custos inteligentes.md).
#
# Prices below are ROUGH, order-of-magnitude public list prices for a small
# always-on compute unit, general-purpose storage, and standard egress traffic
# -- NOT pulled from a live pricing API (none is wired). CONFIRM exact current
# prices in each provider's own pricing page/console before relying on them for
# a real budget decision -- same honesty policy already used for the OpenAI/
# Google entries in app/data/model_registry.py ("placeholders -- CONFIRM exact
# ... pricing ... before enabling in production").
#
# Scope decision (2026-07-20, confirmed with the user): this is a one-way,
# pre-deploy ESTIMATE only. The vault's "custo real é confrontado com
# estimado" criterion is NOT implemented -- there is no real cloud deploy
# anywhere in this codebase (delivery is ZIP/Git export/stay-in-LDCN only, see
# app/engines/delivery_decision_engine.py), so there is no real bill to ever
# reconcile against. Faking one would mean inventing data, which this
# codebase's established policy forbids.

LOAD_TIERS = ("micro", "small", "medium", "large")

# Maps work_estimation_engine.estimate_generation_effort()'s real, already-
# tested size_band onto a load tier -- reused wholesale rather than re-deriving
# a second scoring function from the same ProjectSpec signals.
SIZE_BAND_TO_LOAD_TIER: dict[str, str] = {
    "landing_page": "micro",
    "api_simples": "small",
    "saas": "medium",
    "enterprise": "large",
}


@dataclass(frozen=True)
class LoadAssumption:
    monthly_active_users_label: str
    storage_gb: float
    monthly_traffic_gb: float
    # Real usage before launch is unknowable -- every estimate is shown as a
    # [low, high] range using this multiplier, not a single false-precision number.
    uncertainty_multiplier: float


LOAD_ASSUMPTIONS: dict[str, LoadAssumption] = {
    "micro": LoadAssumption("< 1,000 MAU", storage_gb=1, monthly_traffic_gb=5, uncertainty_multiplier=3.0),
    "small": LoadAssumption("1,000-10,000 MAU", storage_gb=10, monthly_traffic_gb=50, uncertainty_multiplier=2.5),
    "medium": LoadAssumption("10,000-100,000 MAU", storage_gb=100, monthly_traffic_gb=500, uncertainty_multiplier=2.0),
    "large": LoadAssumption("100,000+ MAU", storage_gb=1000, monthly_traffic_gb=5000, uncertainty_multiplier=1.5),
}


@dataclass(frozen=True)
class ProviderPricing:
    provider_id: str
    name: str
    # Rough monthly compute cost (USD) for a small/medium always-on unit sized
    # to each load tier -- NOT a real quote, see module docstring.
    compute_usd_by_tier: dict[str, float]
    storage_usd_per_gb_month: float
    egress_usd_per_gb: float
    lock_in_risk: str  # "Baixo" | "Médio" | "Alto"
    tradeoffs: tuple[str, ...]


PROVIDER_PRICING: dict[str, ProviderPricing] = {
    "aws": ProviderPricing(
        provider_id="aws", name="AWS",
        compute_usd_by_tier={"micro": 15, "small": 60, "medium": 250, "large": 1200},
        storage_usd_per_gb_month=0.023, egress_usd_per_gb=0.09, lock_in_risk="Alto",
        tradeoffs=(
            "Maior catálogo de serviços e maturidade operacional.",
            "Curva de aprendizado e superfície de configuração maiores.",
            "Egress tende a ser o item mais caro em cargas com muito tráfego.",
        ),
    ),
    "azure": ProviderPricing(
        provider_id="azure", name="Azure",
        compute_usd_by_tier={"micro": 15, "small": 65, "medium": 260, "large": 1250},
        storage_usd_per_gb_month=0.0208, egress_usd_per_gb=0.087, lock_in_risk="Alto",
        tradeoffs=(
            "Forte integração com ecossistema Microsoft/.NET e Active Directory.",
            "Preço e complexidade operacional próximos da AWS.",
        ),
    ),
    "railway": ProviderPricing(
        provider_id="railway", name="Railway",
        compute_usd_by_tier={"micro": 5, "small": 20, "medium": 90, "large": 450},
        storage_usd_per_gb_month=0.25, egress_usd_per_gb=0.10, lock_in_risk="Médio",
        tradeoffs=(
            "Caminho mais rápido para ir ao ar; operação quase zero.",
            "Menos controle de infraestrutura fina; menos previsível em escala grande.",
            "Sem tier enterprise robusto para cargas muito grandes.",
        ),
    ),
    "render": ProviderPricing(
        provider_id="render", name="Render",
        compute_usd_by_tier={"micro": 7, "small": 25, "medium": 100, "large": 500},
        storage_usd_per_gb_month=0.25, egress_usd_per_gb=0.10, lock_in_risk="Médio",
        tradeoffs=(
            "Simplicidade de deploy comparável ao Railway, com bom suporte a Docker.",
            "Catálogo de serviços gerenciados menor que AWS/Azure (sem tantos serviços de dados especializados).",
        ),
    ),
}
