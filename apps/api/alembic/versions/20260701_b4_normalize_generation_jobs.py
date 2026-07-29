"""Normalize generation job state and persist token usage.

Revision ID: 20260701_b4_jobs
Revises: 68b1ef9a3a1c
Create Date: 2026-07-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_b4_jobs"
down_revision = "68b1ef9a3a1c"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.add_column(sa.Column("status", sa.String(), server_default="QUEUED", nullable=False))
        batch_op.add_column(sa.Column("stage", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("model", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("error", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("result_path", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("input_tokens_total", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("output_tokens_total", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("started_at", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("completed_at", sa.String(), nullable=True))
        batch_op.create_index("ix_generation_jobs_status", ["status"], unique=False)
        batch_op.create_index("ix_generation_jobs_stage", ["stage"], unique=False)
        batch_op.create_index("idx_generation_jobs_owner_status", ["owner_user_id", "status"], unique=False)

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("""
            UPDATE generation_jobs
            SET status = COALESCE(data_json::jsonb ->> 'status', 'QUEUED'),
                stage = data_json::jsonb ->> 'currentStage',
                model = data_json::jsonb ->> 'model',
                error = CASE WHEN data_json::jsonb -> 'error' = 'null'::jsonb THEN NULL ELSE (data_json::jsonb -> 'error')::text END,
                started_at = data_json::jsonb ->> 'startedAt',
                completed_at = data_json::jsonb ->> 'finishedAt'
        """))
    elif bind.dialect.name == "sqlite":
        op.execute(sa.text("""
            UPDATE generation_jobs
            SET status = COALESCE(json_extract(data_json, '$.status'), 'QUEUED'),
                stage = json_extract(data_json, '$.currentStage'),
                model = json_extract(data_json, '$.model'),
                error = CASE WHEN json_type(data_json, '$.error') IN ('object', 'array') THEN json_extract(data_json, '$.error') ELSE NULL END,
                started_at = json_extract(data_json, '$.startedAt'),
                completed_at = json_extract(data_json, '$.finishedAt')
        """))


def downgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.drop_index("idx_generation_jobs_owner_status")
        batch_op.drop_index("ix_generation_jobs_stage")
        batch_op.drop_index("ix_generation_jobs_status")
        batch_op.drop_column("completed_at")
        batch_op.drop_column("started_at")
        batch_op.drop_column("output_tokens_total")
        batch_op.drop_column("input_tokens_total")
        batch_op.drop_column("result_path")
        batch_op.drop_column("error")
        batch_op.drop_column("model")
        batch_op.drop_column("stage")
        batch_op.drop_column("status")