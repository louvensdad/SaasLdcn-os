"""Add metering_records, resource_entitlements (Metering/Entitlements/Resource
Manager slice of vault 56 - Monetização e Consumo; real "Billing" -- payment
processing/invoices -- deliberately not built, see metering_engine.py).

Revision ID: 20260720_z3_metering
Revises: 20260720_z2_staging_deployments
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_z3_metering"
down_revision = "20260720_z2_staging_deployments"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "metering_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("quantity", sa.Float(), nullable=False),
        sa.Column("unit", sa.String(), nullable=False),
        sa.Column("origin", sa.String(), nullable=False),
        sa.Column("occurred_at", sa.String(), nullable=False),
    )
    op.create_index("idx_metering_owner_resource_time", "metering_records", ["owner_user_id", "resource_type", "occurred_at"])

    op.create_table(
        "resource_entitlements",
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("resource_type", sa.String(), nullable=False),
        sa.Column("monthly_limit", sa.Float(), nullable=False),
        sa.Column("updated_by_user_id", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("owner_user_id", "resource_type"),
    )


def downgrade() -> None:
    op.drop_table("resource_entitlements")
    op.drop_index("idx_metering_owner_resource_time", table_name="metering_records")
    op.drop_table("metering_records")
