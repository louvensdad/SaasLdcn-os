"""Scope Git credentials/repositories and activity events by workspace.

Idempotent by design: a container restart after a crash mid-migration (the
rename/create/insert/drop sequence isn't a single atomic DDL statement on
SQLite) must be able to re-run this safely instead of colliding with its own
half-finished previous attempt.

Revision ID: 20260716_p2_workspace_scoped_git
Revises: 20260716_p1_activity_feed
"""
from alembic import op
import sqlalchemy as sa

revision = "20260716_p2_workspace_scoped_git"
down_revision = "20260716_p1_activity_feed"
branch_labels = None
depends_on = None


def _workspace_expression(alias: str) -> str:
    return f"COALESCE((SELECT workspace_id FROM workspace_memberships wm WHERE wm.user_id = {alias}.user_id ORDER BY wm.created_at LIMIT 1), 'ws_personal_' || {alias}.user_id)"


def _has_table(inspector, name: str) -> bool:
    return name in inspector.get_table_names()


def _has_column(inspector, table: str, column: str) -> bool:
    return any(c["name"] == column for c in inspector.get_columns(table))


def _migrate_git_table(inspector, *, name: str, key_column: str, select_expr_alias: str) -> None:
    """Rename -> recreate workspace-scoped -> backfill -> drop, tolerant of a
    prior crashed attempt at this exact step (stray `_legacy` table, or the
    new shape already in place)."""
    legacy = f"{name}_legacy"

    if _has_table(inspector, name) and _has_column(inspector, name, "workspace_id"):
        # A previous run already finished migrating this table.
        if _has_table(inspector, legacy):
            op.drop_table(legacy)
        return

    if _has_table(inspector, legacy):
        # Leftover from a previous crashed attempt. The real data is still
        # safe in the un-renamed `name` table (its own rename never
        # committed, or this is a stale duplicate) -- redundant, drop it.
        op.drop_table(legacy)

    op.rename_table(name, legacy)
    if name == "git_provider_connections":
        op.create_table(
            name,
            sa.Column("workspace_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("provider", sa.String(), nullable=False),
            sa.Column("encrypted_token", sa.Text(), nullable=False),
            sa.Column("profile_json", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("workspace_id", "user_id", "provider"),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.workspace_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        )
        op.execute(
            f"INSERT INTO {name} (workspace_id,user_id,provider,encrypted_token,profile_json,updated_at) "
            f"SELECT {_workspace_expression(select_expr_alias)},{select_expr_alias}.user_id,{select_expr_alias}.provider,"
            f"{select_expr_alias}.encrypted_token,{select_expr_alias}.profile_json,{select_expr_alias}.updated_at "
            f"FROM {legacy} {select_expr_alias}"
        )
    else:
        op.create_table(
            name,
            sa.Column("workspace_id", sa.String(), nullable=False),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("repo_key", sa.String(), nullable=False),
            sa.Column("repository_json", sa.Text(), nullable=False),
            sa.Column("updated_at", sa.String(), nullable=False),
            sa.PrimaryKeyConstraint("workspace_id", "user_id", "repo_key"),
            sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.workspace_id"], ondelete="CASCADE"),
            sa.ForeignKeyConstraint(["user_id"], ["users.user_id"], ondelete="CASCADE"),
        )
        op.execute(
            f"INSERT INTO {name} (workspace_id,user_id,repo_key,repository_json,updated_at) "
            f"SELECT {_workspace_expression(select_expr_alias)},{select_expr_alias}.user_id,{select_expr_alias}.repo_key,"
            f"{select_expr_alias}.repository_json,{select_expr_alias}.updated_at "
            f"FROM {legacy} {select_expr_alias}"
        )
    op.drop_table(legacy)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _migrate_git_table(inspector, name="git_provider_connections", key_column="provider", select_expr_alias="g")
    _migrate_git_table(inspector, name="git_provider_repositories", key_column="repo_key", select_expr_alias="r")

    existing_indexes = {ix["name"] for ix in inspector.get_indexes("git_provider_connections")}
    if "idx_git_connections_workspace_user" not in existing_indexes:
        op.create_index("idx_git_connections_workspace_user", "git_provider_connections", ["workspace_id", "user_id"])
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("git_provider_repositories")}
    if "idx_git_repositories_workspace_user" not in existing_indexes:
        op.create_index("idx_git_repositories_workspace_user", "git_provider_repositories", ["workspace_id", "user_id"])

    # `activity_events` (20260716_p1_activity_feed) already creates this
    # column -- only backfill/patch here if an older instance of that
    # migration predates the column being added there.
    if not _has_column(inspector, "activity_events", "workspace_id"):
        with op.batch_alter_table("activity_events") as batch:
            batch.add_column(sa.Column("workspace_id", sa.String(), nullable=True))
    op.execute(
        "UPDATE activity_events SET workspace_id = "
        "(SELECT workspace_id FROM workspace_memberships wm WHERE wm.user_id = activity_events.user_id "
        "ORDER BY wm.created_at LIMIT 1) WHERE workspace_id IS NULL"
    )
    existing_indexes = {ix["name"] for ix in inspector.get_indexes("activity_events")}
    if "idx_activity_events_workspace_user_occurred" not in existing_indexes:
        op.create_index(
            "idx_activity_events_workspace_user_occurred", "activity_events", ["workspace_id", "user_id", "occurred_at"]
        )


def downgrade() -> None:
    op.drop_index("idx_activity_events_workspace_user_occurred", table_name="activity_events")
    with op.batch_alter_table("activity_events") as batch:
        batch.drop_column("workspace_id")
    op.drop_index("idx_git_repositories_workspace_user", table_name="git_provider_repositories")
    op.drop_index("idx_git_connections_workspace_user", table_name="git_provider_connections")
    raise RuntimeError("Downgrade of workspace-scoped Git requires a manual data migration.")
