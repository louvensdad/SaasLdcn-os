"""Add features (vault 67 - Features: Projeto → Epic → Feature → Task → Change Request).

Revision ID: 20260720_y1_features
Revises: 20260720_x1_memories
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_y1_features"
down_revision = "20260720_x1_memories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "features",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("problem", sa.Text(), nullable=False),
        sa.Column("objective", sa.Text(), nullable=False),
        sa.Column("target_users_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("scope_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("acceptance_criteria_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("dependencies_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("metrics_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("risks_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("priority", sa.String(), nullable=False, server_default="medium"),
        sa.Column("target_version", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="Proposed"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_feature_project", "features", ["project_id"])
    op.create_index("idx_feature_owner", "features", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("idx_feature_owner", table_name="features")
    op.drop_index("idx_feature_project", table_name="features")
    op.drop_table("features")
