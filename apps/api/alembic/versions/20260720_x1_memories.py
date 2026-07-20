"""Add memories (persistent, governed, corrigível context per vault 28/54).

Revision ID: 20260720_x1_memories
Revises: 20260720_w1_evolution_signals
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_x1_memories"
down_revision = "20260720_w1_evolution_signals"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "memories",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("scope_type", sa.String(), nullable=False),
        sa.Column("scope_id", sa.String(), nullable=False),
        sa.Column("memory_type", sa.String(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("origin", sa.String(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=False),
        sa.Column("expires_at", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("corrected_from_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_memory_scope", "memories", ["scope_type", "scope_id"])
    op.create_index("idx_memory_owner", "memories", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("idx_memory_owner", table_name="memories")
    op.drop_index("idx_memory_scope", table_name="memories")
    op.drop_table("memories")
