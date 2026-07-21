"""Add marketplace_items, marketplace_installs (vault 42 - Contratos/Marketplace Contract.md, declarative-only v1).

Revision ID: 20260721_a1_marketplace
Revises: 20260720_z3_metering
Create Date: 2026-07-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260721_a1_marketplace"
down_revision = "20260720_z3_metering"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "marketplace_items",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("author_user_id", sa.String(), nullable=False),
        sa.Column("kind", sa.String(), nullable=False, server_default="automation_template"),
        sa.Column("source_automation_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("license", sa.String(), nullable=False, server_default="Proprietary"),
        sa.Column("permissions_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("price_cents", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("content_json", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(), nullable=False),
        sa.Column("changelog_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_marketplace_item_author", "marketplace_items", ["author_user_id"])
    op.create_index("idx_marketplace_item_status", "marketplace_items", ["status"])

    op.create_table(
        "marketplace_installs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("item_id", sa.String(), nullable=False),
        sa.Column("item_version", sa.Integer(), nullable=False),
        sa.Column("installer_user_id", sa.String(), nullable=False),
        sa.Column("installed_automation_id", sa.String(), nullable=False),
        sa.Column("installed_at", sa.String(), nullable=False),
        sa.Column("uninstalled_at", sa.String(), nullable=True),
    )
    op.create_index("idx_marketplace_install_installer", "marketplace_installs", ["installer_user_id"])
    op.create_index("idx_marketplace_install_item", "marketplace_installs", ["item_id"])


def downgrade() -> None:
    op.drop_index("idx_marketplace_install_item", table_name="marketplace_installs")
    op.drop_index("idx_marketplace_install_installer", table_name="marketplace_installs")
    op.drop_table("marketplace_installs")
    op.drop_index("idx_marketplace_item_status", table_name="marketplace_items")
    op.drop_index("idx_marketplace_item_author", table_name="marketplace_items")
    op.drop_table("marketplace_items")