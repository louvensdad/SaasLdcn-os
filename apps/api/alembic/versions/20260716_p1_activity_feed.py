"""Add durable, redacted Settings activity events."""
from alembic import op
import sqlalchemy as sa
revision = "20260716_p1_activity_feed"
down_revision = "20260716_o1_settings_preference_categories"
branch_labels = None
depends_on = None
def upgrade() -> None:
    op.create_table("activity_events", sa.Column("id", sa.String(), primary_key=True), sa.Column("user_id", sa.String(), nullable=False), sa.Column("workspace_id", sa.String()), sa.Column("project_id", sa.String()), sa.Column("category", sa.String(), nullable=False), sa.Column("action", sa.String(), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"), sa.Column("occurred_at", sa.String(), nullable=False), sa.Column("source", sa.String(), nullable=False), sa.Column("correlation_id", sa.String(), nullable=False))
    op.create_index("idx_activity_events_user_occurred", "activity_events", ["user_id", "occurred_at"])
    op.create_index("idx_activity_events_workspace_occurred", "activity_events", ["workspace_id", "occurred_at"])
    op.create_index("idx_activity_events_category_status", "activity_events", ["category", "status"])
def downgrade() -> None:
    op.drop_index("idx_activity_events_category_status", table_name="activity_events"); op.drop_index("idx_activity_events_workspace_occurred", table_name="activity_events"); op.drop_index("idx_activity_events_user_occurred", table_name="activity_events"); op.drop_table("activity_events")
