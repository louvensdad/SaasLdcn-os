"""Add workspace_permission_overrides (RBAC/ABAC "Configurável" cells).

Revision ID: 20260720_u1_workspace_permission_overrides
Revises: 20260720_t1_llm_decision_traces
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_u1_workspace_permission_overrides"
down_revision = "20260720_t1_llm_decision_traces"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workspace_permission_overrides",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("allowed", sa.Boolean(), nullable=False),
        sa.Column("updated_by_user_id", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("workspace_id", "action", "role"),
    )


def downgrade() -> None:
    op.drop_table("workspace_permission_overrides")
