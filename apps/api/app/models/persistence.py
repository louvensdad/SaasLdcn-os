from __future__ import annotations

from sqlalchemy import Boolean, Float, Index, Integer, PrimaryKeyConstraint, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Project(Base):
    __tablename__ = "projects"

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str | None] = mapped_column(String, index=True)
    workspace_id: Mapped[str | None] = mapped_column(String, index=True)
    project_key: Mapped[str] = mapped_column(String, nullable=False, index=True)
    project_name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    objective: Mapped[str | None] = mapped_column(Text)
    stack_id: Mapped[str | None] = mapped_column(String)
    project_locale: Mapped[str | None] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, nullable=False, index=True)
    scope: Mapped[str | None] = mapped_column(Text)
    locale: Mapped[str] = mapped_column(String, nullable=False)
    generation_mode: Mapped[str] = mapped_column(String, nullable=False)
    technology_graph_json: Mapped[str] = mapped_column(Text, nullable=False)
    architecture_id: Mapped[str] = mapped_column(String, nullable=False)
    archetype_id: Mapped[str] = mapped_column(String, nullable=False)
    selected_capabilities_json: Mapped[str] = mapped_column(Text, nullable=False)
    selected_business_modules_json: Mapped[str] = mapped_column(Text, nullable=False)
    selected_endpoints_json: Mapped[str] = mapped_column(Text, nullable=False)
    blueprint_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    architectural_graph_snapshot_json: Mapped[str | None] = mapped_column(Text)
    prompt_master_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    gatekeeper_snapshot_json: Mapped[str] = mapped_column(Text, nullable=False)
    tags_json: Mapped[str | None] = mapped_column(Text)
    readiness_status: Mapped[str] = mapped_column(String, nullable=False)
    contract_version: Mapped[str] = mapped_column(String, nullable=False)
    generated_project_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String, nullable=False, index=True)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class ProjectRoom(Base):
    __tablename__ = "project_rooms"
    __table_args__ = (Index("idx_project_rooms_owner", "owner_user_id"),)

    room_id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String)
    title: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, index=True)
    delivery_type: Mapped[str] = mapped_column(String, nullable=False, default="web", server_default="web")
    # "" = auto (orchestrator/LLM decides); otherwise a language profile id the
    # user explicitly chose at room creation — enforced onto every compiled spec.
    preferred_language: Mapped[str] = mapped_column(String, nullable=False, default="", server_default="")
    raw_intent: Mapped[str] = mapped_column(Text, nullable=False, default="")
    locale: Mapped[str] = mapped_column(String, nullable=False, default="pt-BR")
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    degraded: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    spec_json: Mapped[str | None] = mapped_column(Text)
    messages_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    prompt_master_md: Mapped[str | None] = mapped_column(Text)
    prompt_master_versions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    architecture_blueprint_json: Mapped[str | None] = mapped_column(Text)
    blueprint_versions_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    active_blueprint_version: Mapped[int | None] = mapped_column(Integer)
    generation_handoff_json: Mapped[str | None] = mapped_column(Text)
    history_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    operational_log_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    last_failure_json: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class ModernizeJob(Base):
    __tablename__ = "modernize_jobs"
    __table_args__ = (Index("idx_modernize_jobs_owner", "owner_user_id"),)

    project_id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String, index=True)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class GenerationJob(Base):
    __tablename__ = "generation_jobs"
    __table_args__ = (
        Index("idx_generation_jobs_owner", "owner_user_id", "updated_at"),
        Index("idx_generation_jobs_owner_status", "owner_user_id", "status"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String, index=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="QUEUED", server_default="QUEUED", index=True)
    stage: Mapped[str | None] = mapped_column(String, index=True)
    model: Mapped[str | None] = mapped_column(String)
    error: Mapped[str | None] = mapped_column(Text)
    result_path: Mapped[str | None] = mapped_column(Text)
    input_tokens_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    output_tokens_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    started_at: Mapped[str | None] = mapped_column(String)
    completed_at: Mapped[str | None] = mapped_column(String)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0", index=True)
    data_json: Mapped[str] = mapped_column(Text, nullable=False)
    spec_json: Mapped[str] = mapped_column(Text, nullable=False)
    blueprint_json: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class BlueprintApproval(Base):
    __tablename__ = "blueprint_approvals"
    __table_args__ = (Index("idx_blueprint_approvals_project", "project_id", "blueprint_hash"),)

    approval_id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False)
    blueprint_hash: Mapped[str] = mapped_column(String, nullable=False)
    approved_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    revoked_at: Mapped[str | None] = mapped_column(String)


class GitProviderConnection(Base):
    __tablename__ = "git_provider_connections"
    __table_args__ = (PrimaryKeyConstraint("user_id", "provider"),)

    user_id: Mapped[str] = mapped_column(String, nullable=False)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    encrypted_token: Mapped[str] = mapped_column(Text, nullable=False)
    profile_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class GitProviderRepositoryRecord(Base):
    __tablename__ = "git_provider_repositories"
    __table_args__ = (PrimaryKeyConstraint("user_id", "repo_key"),)

    user_id: Mapped[str] = mapped_column(String, nullable=False)
    repo_key: Mapped[str] = mapped_column(String, nullable=False)
    repository_json: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
