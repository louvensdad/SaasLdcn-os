from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.engines.metering_engine import RESOURCE_TYPES, check_entitlement, usage_summary
from app.repositories.metering_repository import MeteringRepository, current_period_start
from app.schemas.billing import EntitlementCheck, SetEntitlementLimitRequest, UsageSummary, UsageSummaryItem

router = APIRouter(tags=["billing"])


@router.get("/billing/usage", response_model=UsageSummary)
def get_usage_summary(user: CurrentUser) -> UsageSummary:
    """Real consumption this calendar month, grouped by resource type (vault
    56 - Monetização e Consumo: "Consumo possui origem e unidade"). Never a
    projected/estimated number -- summed directly from real metering events."""
    items = usage_summary(user["user_id"])
    return UsageSummary(period_start=current_period_start(), items=[UsageSummaryItem.model_validate(item) for item in items])


@router.get("/billing/entitlements/{resource_type}", response_model=EntitlementCheck)
def get_entitlement(resource_type: str, user: CurrentUser) -> EntitlementCheck:
    return check_entitlement(user["user_id"], resource_type)


@router.get("/billing/entitlements", response_model=list[EntitlementCheck])
def list_entitlements(user: CurrentUser) -> list[EntitlementCheck]:
    return [check_entitlement(user["user_id"], resource_type) for resource_type in RESOURCE_TYPES]


@router.put("/billing/entitlements", response_model=EntitlementCheck)
def set_entitlement_limit(payload: SetEntitlementLimitRequest, user: CurrentUser) -> EntitlementCheck:
    """Self-service limit-setting (a user capping their OWN usage, e.g. to
    control spend) -- not an admin-over-another-user endpoint, since there is
    no real plan/subscription entity yet to say who is entitled to set
    someone else's limit."""
    if payload.resource_type not in RESOURCE_TYPES:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Unknown resource_type '{payload.resource_type}'.")
    MeteringRepository().set_limit(user["user_id"], payload.resource_type, payload.monthly_limit, updated_by_user_id=user["user_id"])
    return check_entitlement(user["user_id"], payload.resource_type)
