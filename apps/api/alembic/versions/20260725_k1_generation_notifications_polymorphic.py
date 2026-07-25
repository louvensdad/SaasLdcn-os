"""LDCN Multi-Agent Runtime, Phase 2: add entity_type/entity_id to generation_notifications (additive, job_id unchanged) and backfill existing rows."""
from alembic import op
import sqlalchemy as sa
revision = "20260725_k1_generation_notifications_polymorphic"; down_revision = "20260725_j1_generation_notifications"; branch_labels = None; depends_on = None
def upgrade():
    op.add_column("generation_notifications", sa.Column("entity_type", sa.String()))
    op.add_column("generation_notifications", sa.Column("entity_id", sa.String()))
    # Backfill: every row that exists today was produced by GenerationJobEngine._notify(),
    # so its subject is unambiguously ("generation_job", job_id) -- same values
    # _notify() itself now writes for every new row going forward.
    op.execute("UPDATE generation_notifications SET entity_type = 'generation_job', entity_id = job_id")
    op.create_index("idx_generation_notifications_entity", "generation_notifications", ["entity_type", "entity_id"])
def downgrade():
    op.drop_index("idx_generation_notifications_entity", table_name="generation_notifications")
    op.drop_column("generation_notifications", "entity_id")
    op.drop_column("generation_notifications", "entity_type")
