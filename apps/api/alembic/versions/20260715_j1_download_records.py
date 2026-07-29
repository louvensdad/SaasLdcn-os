"""Add owner-scoped prepared download audit records.

Revision ID: 20260715_j1_download_records
Revises: 20260714_i1_job_leases
Create Date: 2026-07-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260715_j1_download_records"
down_revision = "20260714_i1_job_leases"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "download_records",
        sa.Column("download_id", sa.String(), primary_key=True),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("owner_user_id", sa.String(), nullable=False),
        sa.Column("workspace_id", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("artifact_id", sa.String(), nullable=False),
        sa.Column("download_url", sa.String(), nullable=False),
        sa.Column("checksum_sha256", sa.String(length=64), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("expires_at", sa.String(), nullable=False),
        sa.Column("downloaded_at", sa.String(), nullable=True),
    )
    op.create_index("ix_download_records_status", "download_records", ["status"])
    op.create_index("ix_download_records_expires_at", "download_records", ["expires_at"])
    op.create_index("idx_download_records_owner_created", "download_records", ["owner_user_id", "created_at"])
    op.create_index("idx_download_records_project", "download_records", ["project_id", "created_at"])


def downgrade() -> None:
    op.drop_table("download_records")