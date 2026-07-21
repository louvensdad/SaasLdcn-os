"""Add user_ai_keys: permanent, named, multi-key-per-provider BYOK vault (vault 68)."""
from alembic import op
import sqlalchemy as sa
revision = "20260721_d1_user_ai_key_vault"; down_revision = "20260721_c1_student_history"; branch_labels = None; depends_on = None
def upgrade():
    op.create_table(
        "user_ai_keys",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("nome", sa.String(), nullable=False),
        sa.Column("apelido", sa.String()),
        sa.Column("encrypted_key", sa.Text(), nullable=False),
        sa.Column("masked", sa.String(), nullable=False),
        sa.Column("modelo_padrao", sa.String()),
        sa.Column("status", sa.String(), nullable=False, server_default="untested"),
        sa.Column("ativo", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("is_default_for_provider", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("last_used_at", sa.String()),
        sa.Column("last_validated_at", sa.String()),
    )
    op.create_index("idx_user_ai_keys_user_provider", "user_ai_keys", ["user_id", "provider"])
def downgrade():
    op.drop_index("idx_user_ai_keys_user_provider", table_name="user_ai_keys")
    op.drop_table("user_ai_keys")
