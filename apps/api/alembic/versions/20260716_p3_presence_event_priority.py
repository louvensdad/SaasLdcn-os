"""Add auditable priority and evidence fields to existing activity events."""
from alembic import op
import sqlalchemy as sa

revision = "20260716_p3_presence_event_priority"
down_revision = "20260716_p2_workspace_scoped_git"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("activity_events") as batch:
        batch.add_column(sa.Column("severity", sa.String(), nullable=False, server_default="INFO"))
        batch.add_column(sa.Column("importance", sa.String(), nullable=False, server_default="NORMAL"))
        batch.add_column(sa.Column("evidence_ref", sa.String(), nullable=True))
        batch.add_column(sa.Column("resolved_at", sa.String(), nullable=True))
        batch.create_index("idx_activity_events_workspace_priority", ["workspace_id", "severity", "importance", "occurred_at"])


def downgrade() -> None:
    with op.batch_alter_table("activity_events") as batch:
        batch.drop_index("idx_activity_events_workspace_priority")
        batch.drop_column("resolved_at")
        batch.drop_column("evidence_ref")
        batch.drop_column("importance")
        batch.drop_column("severity")