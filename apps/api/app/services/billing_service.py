from __future__ import annotations

from typing import Any

from app.core.event_catalog import emit_named_event
from app.repositories.billing_repository import BillingRepository


class BillingService:
    def __init__(self, repository: BillingRepository | None = None) -> None:
        self.repository = repository or BillingRepository()

    def start_trial(self, user_id: str) -> dict[str, Any]:
        trial, created = self.repository.start_trial(user_id)
        if created:
            emit_named_event("TrialStarted", user_id, metadata={"expires_at": trial["expires_at"]})
        return trial

    def get_trial(self, user_id: str) -> dict[str, Any] | None:
        trial, just_expired = self.repository.trial(user_id)
        if just_expired:
            emit_named_event("TrialExpired", user_id, metadata={})
        return trial

    def plans(self) -> list[dict[str, Any]]:
        return self.repository.plans()

    def get_subscription(self, organization_id: str) -> dict[str, Any] | None:
        return self.repository.subscription(organization_id)

    def subscribe(self, *, user_id: str, organization_id: str, plan_code: str) -> dict[str, Any]:
        previous = self.repository.subscription(organization_id)
        subscription = self.repository.subscribe(organization_id, plan_code, created_by_user_id=user_id)
        event_name = "SubscriptionChanged" if previous is not None else "SubscriptionCreated"
        emit_named_event(event_name, user_id, metadata={"organization_id": organization_id, "plan_code": plan_code})
        # Real ACTIVE->CONVERTED trial transition (vault state): subscribing
        # while still inside an active trial converts it, it does not just
        # silently coexist with a still-"ACTIVE" trial record.
        if self.repository.convert_trial(user_id):
            emit_named_event("TrialConverted", user_id, metadata={"organization_id": organization_id, "plan_code": plan_code})
        return subscription

    def cancel(self, *, user_id: str, organization_id: str) -> dict[str, Any] | None:
        subscription = self.repository.cancel(organization_id, cancelled_by_user_id=user_id)
        if subscription is not None:
            emit_named_event("SubscriptionCancelled", user_id, metadata={"organization_id": organization_id})
        return subscription
