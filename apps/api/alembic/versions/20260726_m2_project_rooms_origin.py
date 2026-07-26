"""Mission -> ProjectRoom -> GenerationJob canonical handoff, part 2: adds
project_rooms.origin_json (nullable) so a room programmatically seeded by
MissionExecutionHandoffService carries its provenance
({"source": "MISSION_WORKSPACE", "missionId", "deliverableJobId", "handoffId"}).
Additive: every existing (chat-created) room gets NULL."""
from alembic import op
import sqlalchemy as sa
revision = "20260726_m2_project_rooms_origin"; down_revision = "20260726_m1_generation_jobs_source_mission"; branch_labels = None; depends_on = None
def upgrade():
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.add_column(sa.Column("origin_json", sa.Text(), nullable=True))
def downgrade():
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.drop_column("origin_json")
