from __future__ import annotations

from app.core.logging import logger
from app.repositories.metering_repository import MeteringRepository, current_period_start
from app.schemas.billing import EntitlementCheck

# Metering / Entitlements / Resource Manager (vault 56 - Monetização e
# Consumo). Scope decision (2026-07-20, confirmed with the user): builds only
# the three concepts the vault itself calls out as distinct from "Billing"
# ("Billing calcula cobrança; Metering mede consumo; Entitlements autorizam
# uso; Resource Manager executa quotas") -- real payment processing,
# plans/subscriptions, invoices and credits are deliberately NOT built. The
# vault's own "Mapa de Monetização e Consumo.md" links to 8 sub-topics
# (Planos e assinaturas, Créditos de IA, Faturamento e invoices, Overage e
# bloqueios, ...) that do not exist as real documents anywhere in the vault --
# same "no real spec" situation as the Evolution Engine gap, so inventing
# pricing/plan tiers here would mean fabricating business policy, not
# following a real one.
#
# Meters only resources with clean, already-real owner attribution today:
# generation runs + their LLM tokens (GenerationJob.owner_user_id +
# input/outputTokensTotal, already tracked), staging deploys
# (StagingDeployment.owner_user_id), automation runs (AutomationRun.owner_user_id).
# Deliberately NOT metered: CPU/RAM/disk/storage -- no per-owner measurement
# of any of those exists anywhere in this codebase; adding one is real,
# separate future work, not faked here.
#
# Entitlements default to UNLIMITED (no row = no limit) rather than an
# invented number -- ship the real mechanism, never a fabricated tier.
# Checking an entitlement never blocks anything on its own in this v1 --
# actually gating real usage behind an invented limit is a bigger product
# decision than this slice, so this ships as real reporting/checking only.

RESOURCE_TYPES = ("llm_tokens", "generation_run", "staging_deploy", "automation_run")


def record_consumption(*, owner_user_id: str, resource_type: str, quantity: float, unit: str, origin: str) -> None:
    """Fault-isolated (same guarantee as every other *_safely helper this
    session): a metering failure must never break the real operation it's
    measuring."""
    if quantity <= 0:
        return
    try:
        MeteringRepository().record(owner_user_id=owner_user_id, resource_type=resource_type, quantity=quantity, unit=unit, origin=origin)
    except Exception as exc:  # noqa: BLE001 -- deliberate isolation boundary
        logger.warning("metering record failed (ignored): %s", exc)


def usage_summary(owner_user_id: str) -> list[dict]:
    return MeteringRepository().summary_for_owner(owner_user_id, since=current_period_start())


def check_entitlement(owner_user_id: str, resource_type: str) -> EntitlementCheck:
    repo = MeteringRepository()
    used = repo.sum_for_owner(owner_user_id, resource_type, since=current_period_start())
    limit = repo.get_limit(owner_user_id, resource_type)
    allowed = limit is None or used < limit
    return EntitlementCheck(resource_type=resource_type, used=used, monthly_limit=limit, allowed=allowed, period_start=current_period_start())
