from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Index, Integer, PrimaryKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class Plan(Base):
    """A commercial plan (vault 56 - Monetização e Consumo/Planos, assinaturas
    e controle de acesso.md). `price_cents` is nullable and intentionally left
    unset for Básico/Avançado/Pro -- the vault's own pricing table lists their
    price as "política comercial" (undefined), not a number; only Estudante
    (R$30,00/mês, a discounted Básico modality) has a real committed price.
    Fabricating a number here would violate the same anti-fabrication rule
    already applied to plan_limits and resource_entitlements elsewhere in
    this codebase."""

    __tablename__ = "plans"
    code: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    audience: Mapped[str] = mapped_column(String, nullable=False)
    price_cents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    currency: Mapped[str] = mapped_column(String, nullable=False, default="BRL")
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

class PlanFeature(Base):
    __tablename__ = "plan_features"
    __table_args__ = (PrimaryKeyConstraint("plan_code", "feature_code"),)
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code", ondelete="CASCADE"), nullable=False)
    feature_code: Mapped[str] = mapped_column(String, nullable=False)

class PlanLimit(Base):
    __tablename__ = "plan_limits"
    __table_args__ = (PrimaryKeyConstraint("plan_code", "limit_code"),)
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code", ondelete="CASCADE"), nullable=False)
    limit_code: Mapped[str] = mapped_column(String, nullable=False)
    limit_value: Mapped[float | None] = mapped_column(nullable=True)

class Subscription(Base):
    """Belongs to the Organization, never directly to a user (vault: "a
    assinatura pertence à Organização, nunca diretamente ao usuário" --
    authorization chain is Usuário -> Organização -> Workspace ->
    Subscription -> Plano -> Features -> Limites -> Permissões)."""

    __tablename__ = "subscriptions"
    __table_args__ = (Index("idx_subscriptions_org_status", "organization_id", "status"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    plan_code: Mapped[str] = mapped_column(ForeignKey("plans.code"), nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    started_at: Mapped[str] = mapped_column(String, nullable=False)
    current_period_end: Mapped[str | None] = mapped_column(String, nullable=True)
    cancelled_at: Mapped[str | None] = mapped_column(String, nullable=True)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), nullable=False)

class TrialRecord(Base):
    __tablename__ = "trial_records"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), primary_key=True)
    started_at: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    converted_at: Mapped[str | None] = mapped_column(String, nullable=True)


class SubscriptionHistory(Base):
    """Append-only audit trail (vault: persistence lists `subscription_history`
    alongside `subscriptions`) -- every real status transition a subscription
    row goes through (created/changed/cancelled) gets its own row here, same
    "correction = new row" convention already used by metering_records and
    memories.py. Never updated or deleted."""

    __tablename__ = "subscription_history"
    __table_args__ = (Index("idx_subscription_history_org", "organization_id", "changed_at"),)
    id: Mapped[str] = mapped_column(String, primary_key=True)
    subscription_id: Mapped[str] = mapped_column(ForeignKey("subscriptions.id"), nullable=False)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.organization_id"), nullable=False)
    plan_code: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    event: Mapped[str] = mapped_column(String, nullable=False)  # "created" | "changed" | "cancelled"
    changed_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    changed_at: Mapped[str] = mapped_column(String, nullable=False)
