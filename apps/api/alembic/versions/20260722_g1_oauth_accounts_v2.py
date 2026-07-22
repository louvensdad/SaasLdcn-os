"""Create multi-provider OAuth account links with encrypted provider tokens.

Revision ID: 20260722_g1_oauth_accounts_v2
Revises: 20260722_f1_mission_instances
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260722_g1_oauth_accounts_v2"
down_revision = "20260722_f1_mission_instances"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("provider_user_id", sa.String(), nullable=False),
        sa.Column("access_token_encrypted", sa.Text(), nullable=True),
        sa.Column("refresh_token_encrypted", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.String(), nullable=True),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.UniqueConstraint("provider", "provider_user_id", name="uq_oauth_provider_identity"),
        sa.UniqueConstraint("user_id", "provider", name="uq_oauth_user_provider"),
    )
    op.create_index("idx_oauth_accounts_user_id", "oauth_accounts", ["user_id"])

    connection = op.get_bind()
    users = sa.table(
        "users",
        sa.column("user_id", sa.String()),
        sa.column("oauth_provider", sa.String()),
        sa.column("oauth_subject", sa.String()),
        sa.column("created_at", sa.String()),
        sa.column("updated_at", sa.String()),
    )
    oauth_accounts = sa.table(
        "oauth_accounts",
        sa.column("id", sa.String()),
        sa.column("user_id", sa.String()),
        sa.column("provider", sa.String()),
        sa.column("provider_user_id", sa.String()),
        sa.column("created_at", sa.String()),
        sa.column("updated_at", sa.String()),
    )
    rows = connection.execute(
        sa.select(users.c.user_id, users.c.oauth_provider, users.c.oauth_subject, users.c.created_at, users.c.updated_at)
        .where(users.c.oauth_provider.is_not(None), users.c.oauth_subject.is_not(None))
    ).mappings()
    for row in rows:
        connection.execute(
            oauth_accounts.insert().values(
                id=f"oauth_legacy_{row['user_id']}_{row['oauth_provider']}",
                user_id=row["user_id"],
                provider=row["oauth_provider"],
                provider_user_id=row["oauth_subject"],
                created_at=row["created_at"],
                updated_at=row["updated_at"],
            )
        )


def downgrade() -> None:
    op.drop_index("idx_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
