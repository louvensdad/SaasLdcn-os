"""Migrate persisted DeepSeek selections from legacy aliases to V4 Flash."""

from alembic import op
import sqlalchemy as sa


revision = "20260722_e1_deepseek_v4"
down_revision = "20260721_d1_user_ai_key_vault"
branch_labels = None
depends_on = None


def upgrade() -> None:
    connection = op.get_bind()
    parameters = {"chat": "deepseek-chat", "reasoner": "deepseek-reasoner"}
    connection.execute(
        sa.text(
            """
            UPDATE user_ai_keys
            SET modelo_padrao = 'deepseek-v4-flash',
                status = 'untested',
                last_validated_at = NULL
            WHERE provider = 'deepseek'
              AND modelo_padrao IN (:chat, :reasoner)
            """
        ),
        parameters,
    )
    connection.execute(
        sa.text(
            """
            UPDATE llm_active_selection
            SET model = 'deepseek-v4-flash',
                validation_status = 'initializing',
                last_validated_at = NULL
            WHERE provider = 'deepseek'
              AND model IN (:chat, :reasoner)
            """
        ),
        parameters,
    )


def downgrade() -> None:
    # Chat/reasoner intent cannot be reconstructed after both aliases converge
    # on V4 Flash, and the retired aliases must not be restored.
    pass
