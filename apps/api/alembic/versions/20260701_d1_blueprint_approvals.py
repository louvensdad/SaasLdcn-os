"""Add blueprint_approvals table for human-approval audit trail.

Revision ID: 20260701_d1_approvals
Revises: 20260701_c6_tenants
Create Date: 2026-07-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_d1_approvals"
down_revision = "20260701_c6_tenants"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "blueprint_approvals",
        sa.Column("approval_id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("blueprint_hash", sa.String(), nullable=False),
        sa.Column("approved_by_user_id", sa.String(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("revoked_at", sa.String(), nullable=True),
        # project_id is a loose reference (Project Room id or registered Project id
        # depending on caller), same as GenerationJob.project_id -- no FK constraint.
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("approval_id"),
    )
    op.create_index(
        "idx_blueprint_approvals_project", "blueprint_approvals", ["project_id", "blueprint_hash"]
    )


def downgrade() -> None:
    op.drop_index("idx_blueprint_approvals_project", table_name="blueprint_approvals")
    op.drop_table("blueprint_approvals")
