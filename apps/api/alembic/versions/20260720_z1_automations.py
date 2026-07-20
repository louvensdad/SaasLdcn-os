"""Add automations, automation_credentials, automation_runs (DEC-004: Automação é tipo oficial de projeto).

Revision ID: 20260720_z1_automations
Revises: 20260720_y1_features
Create Date: 2026-07-20
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260720_z1_automations"
down_revision = "20260720_y1_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "automations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("trigger_type", sa.String(), nullable=False),
        sa.Column("trigger_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("next_run_at", sa.String(), nullable=True),
        sa.Column("action_type", sa.String(), nullable=False, server_default="http_request"),
        sa.Column("action_config_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_automation_owner", "automations", ["owner_user_id"])

    op.create_table(
        "automation_credentials",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("automation_id", sa.String(), nullable=False),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("encrypted_value", sa.Text(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
    )
    op.create_index("idx_automation_credential_automation", "automation_credentials", ["automation_id"])

    op.create_table(
        "automation_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("automation_id", sa.String(), nullable=False),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("trigger_source", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="running"),
        sa.Column("started_at", sa.String(), nullable=False),
        sa.Column("finished_at", sa.String(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("masked_request_json", sa.Text(), nullable=True),
        sa.Column("response_status_code", sa.Integer(), nullable=True),
        sa.Column("masked_response_json", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("idx_automation_run_automation", "automation_runs", ["automation_id", "started_at"])


def downgrade() -> None:
    op.drop_index("idx_automation_run_automation", table_name="automation_runs")
    op.drop_table("automation_runs")
    op.drop_index("idx_automation_credential_automation", table_name="automation_credentials")
    op.drop_table("automation_credentials")
    op.drop_index("idx_automation_owner", table_name="automations")
    op.drop_table("automations")
