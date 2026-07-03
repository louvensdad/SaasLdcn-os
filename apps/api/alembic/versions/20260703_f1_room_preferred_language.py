"""Add preferred_language to project_rooms (user-owned stack decision).

The generated project's language is a user decision, not something the
orchestrator LLM may pick on its own. "" means auto (AI suggests).

Revision ID: 20260703_f1_preferred_language
Revises: 20260701_e1_delivery_type
Create Date: 2026-07-03
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260703_f1_preferred_language"
down_revision = "20260701_e1_delivery_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.add_column(
            sa.Column("preferred_language", sa.String(), nullable=False, server_default="")
        )


def downgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.drop_column("preferred_language")
