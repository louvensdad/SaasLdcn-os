"""Add llm_usage_records (real per-call LLM telemetry: tokens/latency/cost).

Revision ID: 20260716_m1_llm_usage
Revises: 20260716_l1_user_avatar
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260716_m1_llm_usage"
down_revision = "20260716_l1_user_avatar"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_usage_records",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("cache_read_tokens", sa.Integer(), nullable=False),
        sa.Column("served_by_cache", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_llm_usage_created_at", "llm_usage_records", ["created_at"])


def downgrade() -> None:
    op.drop_index("idx_llm_usage_created_at", table_name="llm_usage_records")
    op.drop_table("llm_usage_records")
