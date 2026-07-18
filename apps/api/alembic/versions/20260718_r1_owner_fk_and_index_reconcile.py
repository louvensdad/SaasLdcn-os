"""Reconcile owner_user_id foreign keys and stale indexes with the models.

`alembic check` (run in CI) flagged drift between app/models/persistence.py +
activity_event.py and the actual schema: project_rooms/modernize_jobs/
generation_jobs/download_records.owner_user_id gained a
ForeignKey("users.user_id", ondelete="CASCADE") on the model back in
9ec89ea, but no migration ever added the DB-side constraint. Same commit
also dropped two composite indexes from ActivityEvent.__table_args__ (in
favor of individual index=True columns) and made the git tables' workspace
scoping redundant with a leading-column index already covered by their
composite primary key -- none of that was ever migrated either.

Revision ID: 20260718_r1_owner_fk_and_index_reconcile
Revises: 20260717_q1_execution_profile
Create Date: 2026-07-18
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260718_r1_owner_fk_and_index_reconcile"
down_revision = "20260717_q1_execution_profile"
branch_labels = None
depends_on = None

_OWNER_FK_TABLES = ("project_rooms", "modernize_jobs", "generation_jobs", "download_records")


def upgrade() -> None:
    for table in _OWNER_FK_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.create_foreign_key(
                f"fk_{table}_owner_user_id_users",
                "users",
                ["owner_user_id"],
                ["user_id"],
                ondelete="CASCADE",
            )

    op.drop_index("idx_activity_events_workspace_priority", table_name="activity_events")
    op.drop_index("idx_activity_events_workspace_user_occurred", table_name="activity_events")
    op.create_index("ix_activity_events_user_id", "activity_events", ["user_id"])
    op.create_index("ix_activity_events_workspace_id", "activity_events", ["workspace_id"])
    op.create_index("ix_activity_events_occurred_at", "activity_events", ["occurred_at"])
    op.create_index("ix_activity_events_correlation_id", "activity_events", ["correlation_id"])
    op.create_index("ix_activity_events_severity", "activity_events", ["severity"])
    op.create_index("ix_activity_events_importance", "activity_events", ["importance"])

    op.drop_index("idx_git_connections_workspace_user", table_name="git_provider_connections")
    op.drop_index("idx_git_repositories_workspace_user", table_name="git_provider_repositories")


def downgrade() -> None:
    op.create_index(
        "idx_git_repositories_workspace_user", "git_provider_repositories", ["workspace_id", "user_id"]
    )
    op.create_index(
        "idx_git_connections_workspace_user", "git_provider_connections", ["workspace_id", "user_id"]
    )

    op.drop_index("ix_activity_events_importance", table_name="activity_events")
    op.drop_index("ix_activity_events_severity", table_name="activity_events")
    op.drop_index("ix_activity_events_correlation_id", table_name="activity_events")
    op.drop_index("ix_activity_events_occurred_at", table_name="activity_events")
    op.drop_index("ix_activity_events_workspace_id", table_name="activity_events")
    op.drop_index("ix_activity_events_user_id", table_name="activity_events")
    op.create_index(
        "idx_activity_events_workspace_user_occurred",
        "activity_events",
        ["workspace_id", "user_id", "occurred_at"],
    )
    op.create_index(
        "idx_activity_events_workspace_priority",
        "activity_events",
        ["workspace_id", "severity", "importance", "occurred_at"],
    )

    for table in _OWNER_FK_TABLES:
        with op.batch_alter_table(table) as batch_op:
            batch_op.drop_constraint(f"fk_{table}_owner_user_id_users", type_="foreignkey")
