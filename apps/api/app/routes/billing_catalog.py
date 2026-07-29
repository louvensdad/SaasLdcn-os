from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.billing_catalog import PlanView, SubscribeRequest, SubscriptionView, TrialView
from app.services.billing_service import BillingService

router = APIRouter(tags=["billing"])
# Plan catalog carries no user-specific or sensitive data -- a visitor must be
# able to see it before signing up (vault: "Rotas públicas: /{locale}/pricing").
# Registered separately in main.py WITHOUT the `protected` auth dependency.
public_router = APIRouter(tags=["billing"])


def _personal_organization_id(user_id: str) -> str:
    return f"org_personal_{user_id}"


def _resolve_organization_id(user: dict, organization_id: str | None) -> str:
    return organization_id or _personal_organization_id(user["user_id"])


@public_router.get("/billing/plans", response_model=list[PlanView])
def list_plans() -> list[PlanView]:
    return [PlanView.model_validate(item) for item in BillingService().plans()]


@router.get("/billing/trial", response_model=TrialView | None)
def get_trial(user: CurrentUser) -> TrialView | None:
    trial = BillingService().get_trial(user["user_id"])
    return TrialView.model_validate(trial) if trial else None


@router.get("/billing/subscription", response_model=SubscriptionView | None)
def get_subscription(user: CurrentUser, organization_id: str | None = None) -> SubscriptionView | None:
    subscription = BillingService().get_subscription(_resolve_organization_id(user, organization_id))
    return SubscriptionView.model_validate(subscription) if subscription else None


@router.post("/billing/subscription", response_model=SubscriptionView, status_code=status.HTTP_201_CREATED)
def create_subscription(payload: SubscribeRequest, user: CurrentUser) -> SubscriptionView:
    organization_id = _resolve_organization_id(user, payload.organization_id)
    try:
        subscription = BillingService().subscribe(user_id=user["user_id"], organization_id=organization_id, plan_code=payload.plan_code.upper())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "PLAN_NOT_FOUND", "message": "Plano não encontrado."},
        ) from exc
    return SubscriptionView.model_validate(subscription)


@router.post("/billing/subscription/cancel", response_model=SubscriptionView | None)
def cancel_subscription(user: CurrentUser, organization_id: str | None = None) -> SubscriptionView | None:
    subscription = BillingService().cancel(user_id=user["user_id"], organization_id=_resolve_organization_id(user, organization_id))
    return SubscriptionView.model_validate(subscription) if subscription else None
