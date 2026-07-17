"""Add user_preferences, llm_active_selection, platform_runtime_config.

Closes the Settings persistence gap: Interface/IA preferences and the active
LLM selection were previously localStorage-only / in-memory and did not
survive logout or a backend restart. Worker-limit / job-lease / audit-retention
become a single admin-editable platform_runtime_config row instead of only an
env var read once at process start.

Revision ID: 20260716_n1_user_preferences_and_runtime_config
Revises: 20260716_m1_llm_usage
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260716_n1_user_preferences_and_runtime_config"
down_revision = "20260716_m1_llm_usage"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_preferences",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("interface_json", sa.Text(), nullable=True),
        sa.Column("ai_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=False),
    )

    op.create_table(
        "llm_active_selection",
        sa.Column("user_id", sa.String(), primary_key=True),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("model", sa.String(), nullable=False),
        sa.Column("validation_status", sa.String(), nullable=False, server_default="ready"),
        sa.Column("last_validated_at", sa.String(), nullable=True),
        sa.Column("last_used_at", sa.String(), nullable=True),
    )

    op.create_table(
        "platform_runtime_config",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("agent_worker_limit", sa.Integer(), nullable=True),
        sa.Column("generation_job_lease_seconds", sa.Integer(), nullable=True),
        sa.Column("audit_log_retention_days", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.String(), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("platform_runtime_config")
    op.drop_table("llm_active_selection")
    op.drop_table("user_preferences")
