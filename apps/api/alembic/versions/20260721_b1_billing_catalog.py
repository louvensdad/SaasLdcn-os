"""Add plan, trial and subscription catalog for vault 56."""
from alembic import op
import sqlalchemy as sa
revision = "20260721_b1_billing_catalog"; down_revision = "20260721_a1_marketplace"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table("plans", sa.Column("code", sa.String(), primary_key=True), sa.Column("name", sa.String(), nullable=False), sa.Column("audience", sa.String(), nullable=False), sa.Column("price_cents", sa.Integer(), nullable=True), sa.Column("currency", sa.String(), nullable=False), sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.create_table("plan_features", sa.Column("plan_code", sa.String(), sa.ForeignKey("plans.code", ondelete="CASCADE"), nullable=False), sa.Column("feature_code", sa.String(), nullable=False), sa.PrimaryKeyConstraint("plan_code", "feature_code"))
    op.create_table("plan_limits", sa.Column("plan_code", sa.String(), sa.ForeignKey("plans.code", ondelete="CASCADE"), nullable=False), sa.Column("limit_code", sa.String(), nullable=False), sa.Column("limit_value", sa.Float()), sa.PrimaryKeyConstraint("plan_code", "limit_code"))
    op.create_table("subscriptions", sa.Column("id", sa.String(), primary_key=True), sa.Column("organization_id", sa.String(), sa.ForeignKey("organizations.organization_id"), nullable=False), sa.Column("plan_code", sa.String(), sa.ForeignKey("plans.code"), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("started_at", sa.String(), nullable=False), sa.Column("current_period_end", sa.String()), sa.Column("cancelled_at", sa.String()), sa.Column("created_by_user_id", sa.String(), sa.ForeignKey("users.user_id"), nullable=False))
    op.create_index("idx_subscriptions_org_status", "subscriptions", ["organization_id", "status"])
    op.create_table("trial_records", sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id"), primary_key=True), sa.Column("started_at", sa.String(), nullable=False), sa.Column("expires_at", sa.String(), nullable=False), sa.Column("status", sa.String(), nullable=False), sa.Column("converted_at", sa.String()))
def downgrade():
    op.drop_table("trial_records"); op.drop_index("idx_subscriptions_org_status", table_name="subscriptions"); op.drop_table("subscriptions"); op.drop_table("plan_limits"); op.drop_table("plan_features"); op.drop_table("plans")
