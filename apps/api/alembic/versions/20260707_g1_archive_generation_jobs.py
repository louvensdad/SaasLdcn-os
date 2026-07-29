"""Add archived flag to generation_jobs.

Lets a user archive a finished generation job (out of the active list, kept
in history) without deleting it, alongside the existing hard-delete path.

Revision ID: 20260707_g1_archive_jobs
Revises: 20260703_f1_preferred_language
Create Date: 2026-07-07
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260707_g1_archive_jobs"
down_revision = "20260703_f1_preferred_language"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.add_column(sa.Column("archived", sa.Boolean(), server_default="0", nullable=False))
        batch_op.create_index("ix_generation_jobs_archived", ["archived"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.drop_index("ix_generation_jobs_archived")
        batch_op.drop_column("archived")
