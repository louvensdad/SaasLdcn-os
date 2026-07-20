"""Add sandbox_policy_exceptions (time-bound approved allowlist overrides).

Revision ID: 20260720_v1_sandbox_policy_exceptions
Revises: 20260720_u1_workspace_permission_overrides
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_v1_sandbox_policy_exceptions"
down_revision = "20260720_u1_workspace_permission_overrides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "sandbox_policy_exceptions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("program", sa.String(), nullable=False),
        sa.Column("reason", sa.String(), nullable=False),
        sa.Column("approved_by_user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("expires_at", sa.String(), nullable=False),
        sa.Column("revoked_at", sa.String(), nullable=True),
    )
    op.create_index("idx_sandbox_exception_project", "sandbox_policy_exceptions", ["project_id"])
    op.create_index("idx_sandbox_exception_expires_at", "sandbox_policy_exceptions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("idx_sandbox_exception_expires_at", table_name="sandbox_policy_exceptions")
    op.drop_index("idx_sandbox_exception_project", table_name="sandbox_policy_exceptions")
    op.drop_table("sandbox_policy_exceptions")
