from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.database import database_url_for, session_factory
from app.models.billing import Plan, PlanFeature, PlanLimit, Subscription, SubscriptionHistory, TrialRecord

# Full feature vocabulary from vault 56's "Assinaturas e autorização" section.
BASIC_FEATURES = (
    "PROJECT_CREATE", "PROJECT_DELETE", "PROMPT_GENERATE", "BLUEPRINT_GENERATE",
    "BUILD_EXECUTE", "PREVIEW_CREATE", "PATCH_APPLY", "VERSION_RESTORE",
)
ADVANCED_FEATURES = BASIC_FEATURES + ("WORKSPACE_CREATE", "AUTOMATION_EXECUTE", "ANALYTICS_ADVANCED")
PRO_FEATURES = ADVANCED_FEATURES + ("DEPLOY_EXECUTE", "API_ACCESS", "MARKETPLACE_ACCESS", "AI_OBSERVABILITY")

LIMITS = (
    "active_projects", "workspaces", "members", "monthly_ai_credits", "monthly_builds",
    "storage_bytes", "preview_instances", "deployments", "automation_executions", "version_retention",
)

# price_cents=None and any limit not listed below means "política comercial" /
# "configurável" per the vault's own table -- genuinely undefined, never a
# fabricated number (same rule already applied to resource_entitlements).
DEFAULT_PLANS: dict[str, dict[str, Any]] = {
    "BASIC": {
        "name": "Básico", "audience": "individual", "price_cents": None, "features": BASIC_FEATURES,
        "limits": {"active_projects": 3, "workspaces": 1, "members": 1, "preview_instances": 1},
    },
    "ADVANCED": {
        "name": "Avançado", "audience": "professional", "price_cents": None, "features": ADVANCED_FEATURES,
        "limits": {"active_projects": 15, "workspaces": 5, "members": 5, "preview_instances": 3},
    },
    "PRO": {
        "name": "Pro", "audience": "business", "price_cents": None, "features": PRO_FEATURES, "limits": {},
    },
    "STUDENT": {
        "name": "Estudante", "audience": "student", "price_cents": 3000, "features": BASIC_FEATURES,
        "limits": {"active_projects": 3, "workspaces": 1, "members": 1, "preview_instances": 1},
    },
}

TRIAL_DURATION = timedelta(hours=72)
ACTIVE_SUBSCRIPTION_STATUSES = ("ACTIVE", "TRIALING", "PAST_DUE")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _trial_as_dict(row: TrialRecord) -> dict[str, Any]:
    return {
        "user_id": row.user_id, "status": row.status, "started_at": row.started_at,
        "expires_at": row.expires_at, "converted_at": row.converted_at,
    }


def _subscription_as_dict(row: Subscription) -> dict[str, Any]:
    return {
        "id": row.id, "organization_id": row.organization_id, "plan_code": row.plan_code, "status": row.status,
        "started_at": row.started_at, "current_period_end": row.current_period_end,
        "cancelled_at": row.cancelled_at, "created_by_user_id": row.created_by_user_id,
    }


class BillingRepository:
    def __init__(self, database: str | None = None) -> None:
        self._sessions = session_factory(database_url_for(database))

    # -------------------------------------------------------------- Catalog
    def ensure_catalog(self) -> None:
        with self._sessions.begin() as session:
            if session.scalar(select(Plan.code).limit(1)):
                return
            for code, spec in DEFAULT_PLANS.items():
                session.add(Plan(
                    code=code, name=spec["name"], audience=spec["audience"],
                    price_cents=spec["price_cents"], currency="BRL", active=True,
                ))
                session.add_all(PlanFeature(plan_code=code, feature_code=f) for f in spec["features"])
                session.add_all(PlanLimit(plan_code=code, limit_code=k, limit_value=spec["limits"].get(k)) for k in LIMITS)

    def _plan_view(self, session: Session, plan: Plan) -> dict[str, Any]:
        return {
            "code": plan.code, "name": plan.name, "audience": plan.audience,
            "price_cents": plan.price_cents, "currency": plan.currency,
            "features": list(session.scalars(select(PlanFeature.feature_code).where(PlanFeature.plan_code == plan.code)).all()),
            "limits": {row.limit_code: row.limit_value for row in session.scalars(select(PlanLimit).where(PlanLimit.plan_code == plan.code)).all()},
        }

    def plans(self) -> list[dict[str, Any]]:
        self.ensure_catalog()
        order = {code: index for index, code in enumerate(DEFAULT_PLANS)}
        with self._sessions() as session:
            rows = session.scalars(select(Plan).where(Plan.active.is_(True))).all()
            views = [self._plan_view(session, row) for row in rows]
        views.sort(key=lambda view: order.get(view["code"], len(order)))
        return views

    def plan(self, plan_code: str) -> dict[str, Any] | None:
        self.ensure_catalog()
        with self._sessions() as session:
            row = session.get(Plan, plan_code)
            return self._plan_view(session, row) if row is not None else None

    # --------------------------------------------------------------- Trial
    def start_trial(self, user_id: str) -> tuple[dict[str, Any], bool]:
        """Idempotent: called once for real at account registration (vault:
        "iniciada na criação da conta"). Returns (trial, created)."""
        with self._sessions.begin() as session:
            row = session.get(TrialRecord, user_id)
            if row is not None:
                return _trial_as_dict(row), False
            now = _now()
            row = TrialRecord(
                user_id=user_id, started_at=now.isoformat(),
                expires_at=(now + TRIAL_DURATION).isoformat(), status="ACTIVE",
            )
            session.add(row)
            session.flush()
            return _trial_as_dict(row), True

    def trial(self, user_id: str) -> tuple[dict[str, Any] | None, bool]:
        """Read-only except for the one real lazy status transition
        (ACTIVE -> EXPIRED once past expires_at). Returns (trial, just_expired)
        so callers can emit TrialExpired exactly once."""
        with self._sessions.begin() as session:
            row = session.get(TrialRecord, user_id)
            if row is None:
                return None, False
            just_expired = False
            if row.status == "ACTIVE" and datetime.fromisoformat(row.expires_at) <= _now():
                row.status = "EXPIRED"
                just_expired = True
                session.flush()
            return _trial_as_dict(row), just_expired

    def convert_trial(self, user_id: str) -> bool:
        """Real state per vault ("Estados: ... CONVERTED"): a trial converts
        the moment its user subscribes to a paid plan while still ACTIVE.
        Returns True only when a real ACTIVE->CONVERTED transition happened,
        so the caller emits TrialConverted exactly once."""
        with self._sessions.begin() as session:
            row = session.get(TrialRecord, user_id)
            if row is None or row.status != "ACTIVE":
                return False
            row.status = "CONVERTED"
            row.converted_at = _now().isoformat()
            session.flush()
            return True

    # ---------------------------------------------------------- Subscription
    def subscription(self, organization_id: str) -> dict[str, Any] | None:
        with self._sessions() as session:
            row = session.scalar(
                select(Subscription)
                .where(Subscription.organization_id == organization_id, Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES))
                .order_by(Subscription.started_at.desc())
            )
            return _subscription_as_dict(row) if row is not None else None

    def _history(self, session: Session, subscription: Subscription, *, event: str, changed_by_user_id: str, changed_at: str) -> None:
        session.add(SubscriptionHistory(
            id=f"subhist_{uuid4().hex[:12]}", subscription_id=subscription.id, organization_id=subscription.organization_id,
            plan_code=subscription.plan_code, status=subscription.status, event=event,
            changed_by_user_id=changed_by_user_id, changed_at=changed_at,
        ))

    def subscribe(self, organization_id: str, plan_code: str, *, created_by_user_id: str) -> dict[str, Any]:
        self.ensure_catalog()
        now = _now()
        with self._sessions.begin() as session:
            if session.get(Plan, plan_code) is None:
                raise ValueError("unknown_plan")
            current = session.scalar(
                select(Subscription).where(Subscription.organization_id == organization_id, Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES))
            )
            if current is not None:
                current.status = "CANCELLED"
                current.cancelled_at = now.isoformat()
                session.flush()
                self._history(session, current, event="cancelled", changed_by_user_id=created_by_user_id, changed_at=current.cancelled_at)
            row = Subscription(
                id=f"sub_{uuid4().hex[:12]}", organization_id=organization_id, plan_code=plan_code, status="ACTIVE",
                started_at=now.isoformat(), current_period_end=(now + timedelta(days=30)).isoformat(),
                created_by_user_id=created_by_user_id,
            )
            session.add(row)
            session.flush()
            self._history(session, row, event="created" if current is None else "changed", changed_by_user_id=created_by_user_id, changed_at=row.started_at)
            return _subscription_as_dict(row)

    def cancel(self, organization_id: str, *, cancelled_by_user_id: str) -> dict[str, Any] | None:
        now = _now()
        with self._sessions.begin() as session:
            row = session.scalar(
                select(Subscription).where(Subscription.organization_id == organization_id, Subscription.status.in_(ACTIVE_SUBSCRIPTION_STATUSES))
            )
            if row is None:
                return None
            row.status = "CANCELLED"
            row.cancelled_at = now.isoformat()
            session.flush()
            self._history(session, row, event="cancelled", changed_by_user_id=cancelled_by_user_id, changed_at=row.cancelled_at)
            return _subscription_as_dict(row)
