"""Add Google/GitHub OAuth linking to users; hashed_password becomes optional.

OAuth-only accounts never set a password, so hashed_password must accept NULL.
oauth_provider/oauth_subject identify the linked provider account; a unique
index over the pair lets multiple NULLs (password-only accounts) coexist.

Revision ID: 20260710_h1_oauth_accounts
Revises: 20260707_g1_archive_jobs
Create Date: 2026-07-10
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260710_h1_oauth_accounts"
down_revision = "20260707_g1_archive_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column("hashed_password", existing_type=sa.Text(), nullable=True)
        batch_op.add_column(sa.Column("oauth_provider", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("oauth_subject", sa.String(), nullable=True))
        batch_op.create_index(
            "ix_users_oauth_identity", ["oauth_provider", "oauth_subject"], unique=True
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_index("ix_users_oauth_identity")
        batch_op.drop_column("oauth_subject")
        batch_op.drop_column("oauth_provider")
        batch_op.alter_column("hashed_password", existing_type=sa.Text(), nullable=False)
