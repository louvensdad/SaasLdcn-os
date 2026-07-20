"""Add evolution_signals (cross-generation, owner-scoped, consultivo-only learning).

Revision ID: 20260720_w1_evolution_signals
Revises: 20260720_v1_sandbox_policy_exceptions
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_w1_evolution_signals"
down_revision = "20260720_v1_sandbox_policy_exceptions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "evolution_signals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("stack_signature", sa.String(), nullable=False),
        sa.Column("model_strategy", sa.String(), nullable=True),
        sa.Column("delivery_type", sa.String(), nullable=False),
        sa.Column("outcome", sa.String(), nullable=False),
        sa.Column("completeness_status", sa.String(), nullable=True),
        sa.Column("repair_cycles", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_evolution_signal_owner_stack", "evolution_signals", ["owner_user_id", "stack_signature"])


def downgrade() -> None:
    op.drop_index("idx_evolution_signal_owner_stack", table_name="evolution_signals")
    op.drop_table("evolution_signals")
