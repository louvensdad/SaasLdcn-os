"""Add student eligibility and subscription history for vault 56."""
from alembic import op
import sqlalchemy as sa
revision = "20260721_c1_student_history"; down_revision = "20260721_b1_billing_catalog"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "student_verifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("student_status", sa.String(), nullable=False),
        sa.Column("student_document", sa.String()),
        sa.Column("student_validation_method", sa.String()),
        sa.Column("student_verified_at", sa.String()),
        sa.Column("student_expires_at", sa.String()),
        sa.Column("student_notes", sa.String()),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_student_verifications_user_time", "student_verifications", ["user_id", "created_at"])
    op.create_table(
        "subscription_history",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("subscription_id", sa.String(), sa.ForeignKey("subscriptions.id"), nullable=False),
        sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.organization_id"), nullable=False),
        sa.Column("plan_code", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("event", sa.String(), nullable=False),
        sa.Column("changed_by_user_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False),
        sa.Column("changed_at", sa.String(), nullable=False),
    )
    op.create_index("idx_subscription_history_org", "subscription_history", ["organization_id", "changed_at"])
def downgrade():
    op.drop_index("idx_subscription_history_org", table_name="subscription_history"); op.drop_table("subscription_history")
    op.drop_index("idx_student_verifications_user_time", table_name="student_verifications"); op.drop_table("student_verifications")
