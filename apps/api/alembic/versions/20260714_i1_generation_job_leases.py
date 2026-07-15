"""Add durable generation job lease and attempt metadata.

Revision ID: 20260714_i1_job_leases
Revises: 20260710_h1_oauth_accounts
Create Date: 2026-07-14
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260714_i1_job_leases"
down_revision = "20260710_h1_oauth_accounts"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.add_column(sa.Column("attempt_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("lease_owner", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("lease_expires_at", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("heartbeat_at", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("attempt_count", sa.Integer(), server_default="0", nullable=False))
        batch_op.add_column(sa.Column("token_budget", sa.Integer(), server_default="800000", nullable=False))
        batch_op.add_column(sa.Column("reserved_tokens", sa.Integer(), server_default="0", nullable=False))
        batch_op.create_index("ix_generation_jobs_lease_expires_at", ["lease_expires_at"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.drop_index("ix_generation_jobs_lease_expires_at")
        batch_op.drop_column("reserved_tokens")
        batch_op.drop_column("token_budget")
        batch_op.drop_column("attempt_count")
        batch_op.drop_column("heartbeat_at")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("lease_owner")
        batch_op.drop_column("attempt_id")
