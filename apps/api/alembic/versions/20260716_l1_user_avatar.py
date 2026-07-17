"""Add inline profile-avatar storage (data URL) on users.

Revision ID: 20260716_l1_user_avatar
Revises: 20260715_k1_sessions_and_2fa
Create Date: 2026-07-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260716_l1_user_avatar"
down_revision = "20260715_k1_sessions_and_2fa"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column("avatar_url", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("avatar_url")
