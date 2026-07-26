"""Mission -> ProjectRoom -> GenerationJob canonical handoff, part 3: creates
mission_execution_handoffs. One row per Mission, tracking the real ProjectRoom
MissionExecutionHandoffService seeded from it and the real GenerationJob
eventually created once that room clears Engineering Review + Stack Approval."""
from alembic import op
import sqlalchemy as sa
revision = "20260726_m3_mission_execution_handoffs"; down_revision = "20260726_m2_project_rooms_origin"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "mission_execution_handoffs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("mission_id", sa.String(), sa.ForeignKey("mission_instances.mission_id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("owner_user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("deliverable_job_id", sa.String(), nullable=False),
        sa.Column("project_room_id", sa.String(), nullable=True),
        sa.Column("generation_job_id", sa.String(), nullable=True),
        sa.Column("input_checksum", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="PENDING"),
        sa.Column("data_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_mission_execution_handoffs_mission", "mission_execution_handoffs", ["mission_id"])
    op.create_index("idx_mission_execution_handoffs_room", "mission_execution_handoffs", ["project_room_id"])
def downgrade():
    op.drop_index("idx_mission_execution_handoffs_room", table_name="mission_execution_handoffs")
    op.drop_index("idx_mission_execution_handoffs_mission", table_name="mission_execution_handoffs")
    op.drop_table("mission_execution_handoffs")
