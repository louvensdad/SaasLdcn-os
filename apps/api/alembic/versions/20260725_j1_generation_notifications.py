"""Add generation_notifications: real, persisted, per-user notifications for GenerationJob lifecycle transitions."""
from alembic import op
import sqlalchemy as sa
revision = "20260725_j1_generation_notifications"; down_revision = "20260724_i1_mission_deliverable_jobs"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "generation_notifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String()),
        sa.Column("project_id", sa.String()),
        sa.Column("job_id", sa.String(), sa.ForeignKey("generation_jobs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("severity", sa.String(), nullable=False, server_default="INFO"),
        sa.Column("stage", sa.String()),
        sa.Column("read", sa.Boolean(), nullable=False, server_default="0"),
        sa.Column("action_url", sa.String()),
        sa.Column("idempotency_key", sa.String(), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_generation_notifications_user", "generation_notifications", ["user_id", "created_at"])
    op.create_index("idx_generation_notifications_user_read", "generation_notifications", ["user_id", "read"])
    op.create_index("idx_generation_notifications_job_idem", "generation_notifications", ["job_id", "user_id", "idempotency_key"])
    op.create_index("ix_generation_notifications_job_id", "generation_notifications", ["job_id"])
    op.create_index("ix_generation_notifications_read", "generation_notifications", ["read"])
def downgrade():
    op.drop_index("ix_generation_notifications_read", table_name="generation_notifications")
    op.drop_index("ix_generation_notifications_job_id", table_name="generation_notifications")
    op.drop_index("idx_generation_notifications_job_idem", table_name="generation_notifications")
    op.drop_index("idx_generation_notifications_user_read", table_name="generation_notifications")
    op.drop_index("idx_generation_notifications_user", table_name="generation_notifications")
    op.drop_table("generation_notifications")
