"""Persist all user-owned Settings preference categories.

Revision ID: 20260716_o1_settings_preference_categories
Revises: 20260716_n1_user_preferences_and_runtime_config
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20260716_o1_settings_preference_categories"
down_revision = "20260716_n1_user_preferences_and_runtime_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("personal_json", "git_json", "advanced_json", "locale_json"):
        op.add_column("user_preferences", sa.Column(name, sa.Text(), nullable=True))


def downgrade() -> None:
    for name in ("locale_json", "advanced_json", "git_json", "personal_json"):
        op.drop_column("user_preferences", name)