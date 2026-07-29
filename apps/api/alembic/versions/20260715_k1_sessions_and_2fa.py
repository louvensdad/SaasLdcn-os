"""Add user_sessions (device/IP-aware session tracking) and TOTP 2FA fields on users.

Revision ID: 20260715_k1_sessions_and_2fa
Revises: 20260715_j1_download_records
Create Date: 2026-07-15
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260715_k1_sessions_and_2fa"
down_revision = "20260715_j1_download_records"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_sessions",
        sa.Column("session_id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("refresh_token_jti", sa.String(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("device_label", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("last_seen_at", sa.String(), nullable=False),
        sa.Column("revoked_at", sa.String(), nullable=True),
    )
    op.create_index("idx_user_sessions_user_id", "user_sessions", ["user_id"])
    op.create_index(
        "idx_user_sessions_refresh_token_jti", "user_sessions", ["refresh_token_jti"], unique=True
    )

    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(
            sa.Column("is_2fa_enabled", sa.Boolean(), nullable=False, server_default=sa.false())
        )
        batch_op.add_column(sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column("totp_secret_encrypted")
        batch_op.drop_column("is_2fa_enabled")

    op.drop_index("idx_user_sessions_refresh_token_jti", table_name="user_sessions")
    op.drop_index("idx_user_sessions_user_id", table_name="user_sessions")
    op.drop_table("user_sessions")
