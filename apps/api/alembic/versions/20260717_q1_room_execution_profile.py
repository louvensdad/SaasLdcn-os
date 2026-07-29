"""Add execution_profile to project_rooms (user-owned engineering-mode decision).

Economy / Professional / Enterprise. "professional" is the default and matches
today's actual pipeline behavior (resolve_execution_profile falls back to it).

Revision ID: 20260717_q1_execution_profile
Revises: 20260716_p3_presence_event_priority
Create Date: 2026-07-17
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260717_q1_execution_profile"
down_revision = "20260716_p3_presence_event_priority"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.add_column(
            sa.Column("execution_profile", sa.String(), nullable=False, server_default="professional")
        )


def downgrade() -> None:
    with op.batch_alter_table("project_rooms") as batch_op:
        batch_op.drop_column("execution_profile")
