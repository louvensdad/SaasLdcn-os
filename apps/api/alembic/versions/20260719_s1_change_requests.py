"""Add change_requests table for the Change Request / patch / rollback feature.

Revision ID: 20260719_s1_change_requests
Revises: 20260718_r1_owner_fk_and_index_reconcile
Create Date: 2026-07-19
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260719_s1_change_requests"
down_revision = "20260718_r1_owner_fk_and_index_reconcile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "change_requests",
        sa.Column("change_request_id", sa.String(), primary_key=True),
        sa.Column(
            "owner_user_id",
            sa.String(),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("room_id", sa.String(), nullable=True),
        sa.Column("feature_id", sa.String(), nullable=True),
        sa.Column("task_id", sa.String(), nullable=True),
        sa.Column("base_version", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="Draft"),
        sa.Column("intent", sa.Text(), nullable=False, server_default=""),
        sa.Column("classification_json", sa.Text(), nullable=True),
        sa.Column("scope_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("impact_json", sa.Text(), nullable=True),
        sa.Column("snapshot_json", sa.Text(), nullable=True),
        sa.Column("diff_json", sa.Text(), nullable=True),
        sa.Column("build_result_json", sa.Text(), nullable=True),
        sa.Column("preview_result_json", sa.Text(), nullable=True),
        sa.Column("approval_json", sa.Text(), nullable=True),
        sa.Column("result_json", sa.Text(), nullable=True),
        sa.Column("history_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("operational_log_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("last_failure_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_change_requests_project", "change_requests", ["project_id", "updated_at"])
    op.create_index("idx_change_requests_owner", "change_requests", ["owner_user_id"])
    op.create_index("ix_change_requests_project_id", "change_requests", ["project_id"])
    op.create_index("ix_change_requests_status", "change_requests", ["status"])


def downgrade() -> None:
    op.drop_index("ix_change_requests_status", table_name="change_requests")
    op.drop_index("ix_change_requests_project_id", table_name="change_requests")
    op.drop_index("idx_change_requests_owner", table_name="change_requests")
    op.drop_index("idx_change_requests_project", table_name="change_requests")
    op.drop_table("change_requests")
