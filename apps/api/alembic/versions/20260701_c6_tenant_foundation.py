"""Add organizations, workspaces and tenant membership foundation.

Revision ID: 20260701_c6_tenants
Revises: 20260701_b4_jobs
Create Date: 2026-07-01
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260701_c6_tenants"
down_revision = "20260701_b4_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "organizations",
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("organization_id"),
        sa.UniqueConstraint("slug", name="uq_organizations_slug"),
    )
    op.create_table(
        "organization_memberships",
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.organization_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("organization_id", "user_id"),
    )
    op.create_index("idx_org_memberships_user", "organization_memberships", ["user_id"])
    op.create_table(
        "workspaces",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("organization_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("slug", sa.String(), nullable=False),
        sa.Column("is_personal", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.Column("updated_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["organization_id"], ["organizations.organization_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("workspace_id"),
        sa.UniqueConstraint("organization_id", "slug", name="uq_workspaces_org_slug"),
    )
    op.create_index("idx_workspaces_organization", "workspaces", ["organization_id"])
    op.create_table(
        "workspace_memberships",
        sa.Column("workspace_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("created_at", sa.String(), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.workspace_id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.user_id"]),
        sa.PrimaryKeyConstraint("workspace_id", "user_id"),
    )
    op.create_index("idx_workspace_memberships_user", "workspace_memberships", ["user_id"])

    with op.batch_alter_table("projects") as batch_op:
        batch_op.add_column(sa.Column("owner_user_id", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("workspace_id", sa.String(), nullable=True))
        batch_op.create_index("ix_projects_owner_user_id", ["owner_user_id"])
        batch_op.create_index("ix_projects_workspace_id", ["workspace_id"])
    with op.batch_alter_table("modernize_jobs") as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(), nullable=True))
        batch_op.create_index("ix_modernize_jobs_workspace_id", ["workspace_id"])
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.add_column(sa.Column("workspace_id", sa.String(), nullable=True))
        batch_op.create_index("ix_generation_jobs_workspace_id", ["workspace_id"])

    # Every existing user receives a deterministic personal tenant. This makes
    # legacy owner-scoped data immediately tenant-addressable without guessing
    # which business organization it belongs to.
    op.execute(sa.text("""
        INSERT INTO organizations (
            organization_id, name, slug, created_by_user_id, created_at, updated_at
        )
        SELECT
            'org_personal_' || user_id, full_name || ' Personal',
            'personal-' || user_id, user_id, created_at, updated_at
        FROM users
    """))
    op.execute(sa.text("""
        INSERT INTO organization_memberships (organization_id, user_id, role, created_at)
        SELECT 'org_personal_' || user_id, user_id, 'owner', created_at FROM users
    """))
    op.execute(sa.text("""
        INSERT INTO workspaces (
            workspace_id, organization_id, name, slug, is_personal,
            created_by_user_id, created_at, updated_at
        )
        SELECT
            'ws_personal_' || user_id, 'org_personal_' || user_id,
            'Personal Workspace', 'personal', true, user_id, created_at, updated_at
        FROM users
    """))
    op.execute(sa.text("""
        INSERT INTO workspace_memberships (workspace_id, user_id, role, created_at)
        SELECT 'ws_personal_' || user_id, user_id, 'owner', created_at FROM users
    """))
    op.execute(sa.text("""
        UPDATE project_rooms
        SET workspace_id = 'ws_personal_' || owner_user_id
        WHERE workspace_id IS NULL
    """))

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("""
            UPDATE generation_jobs
            SET workspace_id = COALESCE(
                data_json::jsonb ->> 'workspaceId',
                'ws_personal_' || owner_user_id
            )
        """))
        op.execute(sa.text("""
            UPDATE modernize_jobs
            SET workspace_id = COALESCE(
                data_json::jsonb ->> 'workspaceId',
                'ws_personal_' || owner_user_id
            )
        """))
    elif bind.dialect.name == "sqlite":
        op.execute(sa.text("""
            UPDATE generation_jobs
            SET workspace_id = COALESCE(
                json_extract(data_json, '$.workspaceId'),
                'ws_personal_' || owner_user_id
            )
        """))
        op.execute(sa.text("""
            UPDATE modernize_jobs
            SET workspace_id = COALESCE(
                json_extract(data_json, '$.workspaceId'),
                'ws_personal_' || owner_user_id
            )
        """))


def downgrade() -> None:
    with op.batch_alter_table("generation_jobs") as batch_op:
        batch_op.drop_index("ix_generation_jobs_workspace_id")
        batch_op.drop_column("workspace_id")
    with op.batch_alter_table("modernize_jobs") as batch_op:
        batch_op.drop_index("ix_modernize_jobs_workspace_id")
        batch_op.drop_column("workspace_id")
    with op.batch_alter_table("projects") as batch_op:
        batch_op.drop_index("ix_projects_workspace_id")
        batch_op.drop_index("ix_projects_owner_user_id")
        batch_op.drop_column("workspace_id")
        batch_op.drop_column("owner_user_id")

    op.drop_index("idx_workspace_memberships_user", table_name="workspace_memberships")
    op.drop_table("workspace_memberships")
    op.drop_index("idx_workspaces_organization", table_name="workspaces")
    op.drop_table("workspaces")
    op.drop_index("idx_org_memberships_user", table_name="organization_memberships")
    op.drop_table("organization_memberships")
    op.drop_table("organizations")
