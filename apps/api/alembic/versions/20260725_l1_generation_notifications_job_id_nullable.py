"""LDCN Multi-Agent Runtime, Phase 5: generation_notifications.job_id becomes nullable so a second producer (Mission Deliverable Jobs) can use entity_type/entity_id without a generation_jobs row. Additive: every existing row keeps its job_id unchanged."""
from alembic import op
import sqlalchemy as sa
revision = "20260725_l1_generation_notifications_job_id_nullable"; down_revision = "20260725_k1_generation_notifications_polymorphic"; branch_labels = None; depends_on = None
def upgrade():
    # SQLite can't ALTER COLUMN directly; batch mode rebuilds the table.
    # The FK to generation_jobs.id is preserved -- a NULL job_id simply never
    # needs to match a row there (standard FK semantics), so this doesn't
    # weaken referential integrity for any row that DOES carry a job_id.
    with op.batch_alter_table("generation_notifications") as batch_op:
        batch_op.alter_column("job_id", existing_type=sa.String(), nullable=True)
    # entity_type/entity_id becomes the primary idempotency key (job_id-based
    # dedup can't cover a subject without one) -- the old job_idem index stays
    # for the job-scoped SSE query, this is additive.
    op.create_index(
        "idx_generation_notifications_entity_idem", "generation_notifications",
        ["entity_type", "entity_id", "user_id", "idempotency_key"],
    )
def downgrade():
    op.drop_index("idx_generation_notifications_entity_idem", table_name="generation_notifications")
    with op.batch_alter_table("generation_notifications") as batch_op:
        batch_op.alter_column("job_id", existing_type=sa.String(), nullable=False)
