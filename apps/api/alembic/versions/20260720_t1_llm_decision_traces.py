"""Add llm_decision_traces (AI decision-observability: why a model/agent was
chosen -- policy, alternatives, context used, project attribution).

Revision ID: 20260720_t1_llm_decision_traces
Revises: 20260719_s1_change_requests
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_t1_llm_decision_traces"
down_revision = "20260719_s1_change_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "llm_decision_traces",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("agent_role", sa.String(), nullable=True),
        sa.Column("model_strategy", sa.String(), nullable=True),
        sa.Column("selection_policy", sa.String(), nullable=False),
        sa.Column("alternatives_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("context_used_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("project_id", sa.String(), nullable=True),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=False),
        sa.Column("estimated_cost_usd", sa.Float(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
    )
    op.create_index("idx_llm_decision_created_at", "llm_decision_traces", ["created_at"])
    op.create_index("idx_llm_decision_project_id", "llm_decision_traces", ["project_id"])


def downgrade() -> None:
    op.drop_index("idx_llm_decision_project_id", table_name="llm_decision_traces")
    op.drop_index("idx_llm_decision_created_at", table_name="llm_decision_traces")
    op.drop_table("llm_decision_traces")
