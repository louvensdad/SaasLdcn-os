"""Add mission_instances: Mission Workspace field-level mission persistence (vault 38)."""
from alembic import op
import sqlalchemy as sa
revision = "20260722_f1_mission_instances"; down_revision = "20260722_e1_deepseek_v4"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "mission_instances",
        sa.Column("mission_id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", sa.String()),
        sa.Column("mission_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("mode", sa.String(), nullable=False, server_default="guided"),
        sa.Column("experience_level", sa.String(), nullable=False, server_default="intermediate"),
        sa.Column("degraded", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("answers_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("inputs_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("journey_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("decisions_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("rejections_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("derived_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("gaps_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("risks_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("inconsistencies_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("artifacts_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("history_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("operational_log_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("last_failure_json", sa.Text()),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_mission_instances_owner", "mission_instances", ["owner_user_id"])
    op.create_index("idx_mission_instances_type", "mission_instances", ["mission_type"])
    op.create_index("idx_mission_instances_status", "mission_instances", ["status"])
def downgrade():
    op.drop_index("idx_mission_instances_status", table_name="mission_instances")
    op.drop_index("idx_mission_instances_type", table_name="mission_instances")
    op.drop_index("idx_mission_instances_owner", table_name="mission_instances")
    op.drop_table("mission_instances")
