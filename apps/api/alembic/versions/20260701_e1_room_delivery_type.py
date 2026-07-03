"""Add delivery_type to project_rooms (Mobile Factory Phase 0).

Revision ID: 20260701_e1_delivery_type
Revises: 20260701_d1_approvals
Create Date: 2026-07-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_e1_delivery_type"
down_revision = "20260701_d1_approvals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.add_column(
            sa.Column("delivery_type", sa.String(), nullable=False, server_default="web")
        )


def downgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.drop_column("delivery_type")
