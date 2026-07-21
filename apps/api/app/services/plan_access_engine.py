from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from app.core.event_catalog import emit_named_event
from app.repositories.billing_repository import ACTIVE_SUBSCRIPTION_STATUSES, BillingRepository
from app.repositories.metering_repository import MeteringRepository, current_period_start
from app.repositories.project_repository import ProjectRepository
from app.repositories.tenant_repository import TenantRepository
from app.services.live_preview_service import LivePreviewService, live_preview_service

_LIMIT_ERROR_CODES = {
    "active_projects": "PROJECT_LIMIT_REACHED",
    "workspaces": "WORKSPACE_LIMIT_REACHED",
    "monthly_builds": "BUILD_LIMIT_REACHED",
    "preview_instances": "PREVIEW_LIMIT_REACHED",
}


class PlanAccessDeniedError(Exception):
    """Carries the vault's exact commercial-denial error contract: `code`,
    localized `message`, `details`, `correlation_id`, `timestamp`."""

    def __init__(self, code: str, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    def to_detail(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
            "correlation_id": f"pad_{uuid4().hex[:12]}",
            "timestamp": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        }


class PlanAccessEngine:
    """Real access-check engine backing vault 56's Plans/Subscriptions doc.
    Wired for real into: project creation (`check_project_create`), workspace
    creation (`check_workspace_create`), generation-job/build creation
    (`check_build_execute`, /api/meta-factory/jobs) and live-preview start
    (`check_preview_create`, /api/live-preview/start). There is no AI-credit
    limit or check: the platform is BYOK (vault 56) and never meters or bills
    AI/token usage. The vault also lists publish/invites as blocked post-trial-expiry --
    those are NOT wired to this engine and must not be assumed enforced."""

    def __init__(
        self,
        billing_repository: BillingRepository | None = None,
        tenant_repository: TenantRepository | None = None,
        project_repository: ProjectRepository | None = None,
        metering_repository: MeteringRepository | None = None,
        live_preview: LivePreviewService | None = None,
    ) -> None:
        self.billing = billing_repository or BillingRepository()
        self.tenant = tenant_repository or TenantRepository()
        self.projects = project_repository or ProjectRepository()
        self.metering = metering_repository or MeteringRepository()
        self.live_preview = live_preview or live_preview_service

    def _deny(self, user_id: str, organization_id: str, error: PlanAccessDeniedError) -> None:
        event_name = "PlanLimitReached" if error.code.endswith("_LIMIT_REACHED") else "PlanFeatureBlocked"
        emit_named_event(event_name, user_id, metadata={"organization_id": organization_id, **error.to_detail()})
        raise error

    def check(
        self, *, user_id: str, organization_id: str, feature_code: str,
        limit_code: str | None = None, current_usage: int | None = None,
    ) -> None:
        trial, just_expired = self.billing.trial(user_id)
        if just_expired:
            emit_named_event("TrialExpired", user_id, metadata={})
        subscription = self.billing.subscription(organization_id)

        if subscription is None:
            if trial is not None and trial["status"] == "ACTIVE":
                return
            if trial is not None and trial["status"] in ("EXPIRED", "CANCELLED"):
                self._deny(user_id, organization_id, PlanAccessDeniedError(
                    "TRIAL_EXPIRED", "Seu teste gratuito expirou. Assine um plano para continuar.", {"feature": feature_code},
                ))
            self._deny(user_id, organization_id, PlanAccessDeniedError(
                "SUBSCRIPTION_REQUIRED", "É necessário assinar um plano para continuar.", {"feature": feature_code},
            ))
            return

        if subscription["status"] not in ACTIVE_SUBSCRIPTION_STATUSES:
            self._deny(user_id, organization_id, PlanAccessDeniedError(
                "SUBSCRIPTION_INACTIVE", "Sua assinatura não está ativa.", {"status": subscription["status"]},
            ))
            return

        plan = self.billing.plan(subscription["plan_code"])
        if plan is None or feature_code not in plan["features"]:
            self._deny(user_id, organization_id, PlanAccessDeniedError(
                "PLAN_FEATURE_NOT_AVAILABLE", "Este recurso não está disponível no seu plano atual.",
                {"plan": subscription["plan_code"], "feature": feature_code},
            ))
            return

        if limit_code is not None and current_usage is not None:
            limit_value = plan["limits"].get(limit_code)
            if limit_value is not None and current_usage >= limit_value:
                code = _LIMIT_ERROR_CODES.get(limit_code, "PLAN_LIMIT_REACHED")
                self._deny(user_id, organization_id, PlanAccessDeniedError(
                    code, "Limite do plano atingido.", {"limit": limit_code, "value": limit_value, "usage": current_usage},
                ))

    def check_project_create(self, *, user_id: str, organization_id: str) -> None:
        workspace_ids = self.tenant.workspace_ids_for_organization(organization_id)
        usage = self.projects.count_active_projects_for_workspaces(workspace_ids)
        self.check(user_id=user_id, organization_id=organization_id, feature_code="PROJECT_CREATE", limit_code="active_projects", current_usage=usage)

    def check_workspace_create(self, *, user_id: str, organization_id: str) -> None:
        usage = self.tenant.count_workspaces(organization_id)
        self.check(user_id=user_id, organization_id=organization_id, feature_code="WORKSPACE_CREATE", limit_code="workspaces", current_usage=usage)

    def check_build_execute(self, *, user_id: str, organization_id: str) -> None:
        """monthly_builds usage source: metering_records' "generation_run"
        counter (already recorded 1:1 per real GenerationJob by
        generation_job_engine.py) -- the same real count backing
        /api/billing/usage, not a new instrumentation path."""
        usage = int(self.metering.sum_for_owner(user_id, "generation_run", since=current_period_start()))
        self.check(user_id=user_id, organization_id=organization_id, feature_code="BUILD_EXECUTE", limit_code="monthly_builds", current_usage=usage)

    def check_preview_create(self, *, user_id: str, organization_id: str, project_id: str | None = None) -> None:
        """preview_instances is a concurrent cap (vault table lists 1/3/configurable
        alongside active_projects/workspaces), not a monthly counter -- usage
        source is LivePreviewService's own in-memory active-session registry.
        `project_id` excludes that project's own existing session from the
        count, since starting a preview always replaces its own project's
        prior session rather than adding a new one."""
        usage = self.live_preview.active_count_for_owner(user_id, exclude_project_id=project_id)
        self.check(user_id=user_id, organization_id=organization_id, feature_code="PREVIEW_CREATE", limit_code="preview_instances", current_usage=usage)
