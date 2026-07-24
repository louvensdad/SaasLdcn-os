"""Add mission_deliverable_jobs: async, SSE-tracked artifact drafting jobs for Mission Workspace's final step."""
from alembic import op
import sqlalchemy as sa
revision = "20260724_i1_mission_deliverable_jobs"; down_revision = "20260722_g1_oauth_accounts_v2"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "mission_deliverable_jobs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("mission_id", sa.String(), sa.ForeignKey("mission_instances.mission_id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default="QUEUED"),
        sa.Column("idempotency_key", sa.String()),
        sa.Column("heartbeat_at", sa.String()),
        sa.Column("error", sa.Text()),
        sa.Column("data_json", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.Column("completed_at", sa.String()),
    )
    op.create_index("idx_mission_deliverable_jobs_mission", "mission_deliverable_jobs", ["mission_id", "created_at"])
    op.create_index("idx_mission_deliverable_jobs_owner", "mission_deliverable_jobs", ["owner_user_id", "updated_at"])
    op.create_index("idx_mission_deliverable_jobs_idempotency", "mission_deliverable_jobs", ["mission_id", "idempotency_key"])
    op.create_index("ix_mission_deliverable_jobs_status", "mission_deliverable_jobs", ["status"])
def downgrade():
    op.drop_index("ix_mission_deliverable_jobs_status", table_name="mission_deliverable_jobs")
    op.drop_index("idx_mission_deliverable_jobs_idempotency", table_name="mission_deliverable_jobs")
    op.drop_index("idx_mission_deliverable_jobs_owner", table_name="mission_deliverable_jobs")
    op.drop_index("idx_mission_deliverable_jobs_mission", table_name="mission_deliverable_jobs")
    op.drop_table("mission_deliverable_jobs")
