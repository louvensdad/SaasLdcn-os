"""Mission -> ProjectRoom -> GenerationJob canonical handoff, part 1: adds
generation_jobs.source_mission_id (nullable, indexed) so MissionExecutionHandoffService
can find an existing in-flight job for a mission without scanning data_json.
Additive: every existing row gets NULL (created via the primary chat journey,
not a mission handoff)."""
from alembic import op
import sqlalchemy as sa
revision = "20260726_m1_generation_jobs_source_mission"; down_revision = "20260725_l1_generation_notifications_job_id_nullable"; branch_labels = None; depends_on = None
def upgrade():
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.add_column(sa.Column("source_mission_id", sa.String(), nullable=True))
    op.create_index("ix_generation_jobs_source_mission_id", "generation_jobs", ["source_mission_id"])
def downgrade():
    op.drop_index("ix_generation_jobs_source_mission_id", table_name="generation_jobs")
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.drop_column("source_mission_id")
