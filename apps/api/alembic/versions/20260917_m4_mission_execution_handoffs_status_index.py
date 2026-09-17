"""Mission -> ProjectRoom -> GenerationJob canonical handoff, part 4: creates the
one index the model has always asked for. MissionExecutionHandoff.status carries
index=True, which SQLAlchemy names ix_mission_execution_handoffs_status, but part
3 created the table with only the two explicit __table_args__ indexes -- so from
the day the table landed `alembic check` reported an index the models declare and
no migration makes, and failed on every run. Purely additive and reversible;
nothing else about the table changes."""
from alembic import op
revision = "20260917_m4_mission_execution_handoffs_status_index"; down_revision = "20260726_m3_mission_execution_handoffs"; branch_labels = None; depends_on = None
def upgrade():
    op.create_index("ix_mission_execution_handoffs_status", "mission_execution_handoffs", ["status"])
def downgrade():
    op.drop_index("ix_mission_execution_handoffs_status", table_name="mission_execution_handoffs")
