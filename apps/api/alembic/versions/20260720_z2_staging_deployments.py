"""Add staging_deployments (vault 60 - Publicação: ambiente de staging persistente).

Revision ID: 20260720_z2_staging_deployments
Revises: 20260720_z1_automations
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_z2_staging_deployments"
down_revision = "20260720_z1_automations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "staging_deployments",
        sa.Column("project_id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("current_version_id", sa.String(), nullable=True),
        sa.Column("current_snapshot_path", sa.String(), nullable=True),
        sa.Column("previous_version_id", sa.String(), nullable=True),
        sa.Column("previous_snapshot_path", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="stopped"),
        sa.Column("reason", sa.String(), nullable=False, server_default=""),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("staging_deployments")
