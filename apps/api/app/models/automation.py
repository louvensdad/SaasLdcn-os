from __future__ import annotations

from sqlalchemy import Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Automation(Base):
    """Automation as a first-class project type (vault DEC-004 + 06 -
    Automacoes/*). Scoped v1 (confirmed with the user 2026-07-20): a single
    linear trigger -> action flow, no visual editor, no conditions/branching,
    no webhooks yet -- see automation_engine.py's module docstring for the
    full scope-cut list."""

    __tablename__ = "automations"
    __table_args__ = (Index("idx_automation_owner", "owner_user_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String, nullable=True)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    trigger_type: Mapped[str] = mapped_column(String, nullable=False)  # "manual" | "scheduled"
    # scheduled: {"cron": "*/5 * * * *", "timezone": "UTC"}; manual: {}
    trigger_config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    next_run_at: Mapped[str | None] = mapped_column(String, nullable=True)  # scheduled only
    action_type: Mapped[str] = mapped_column(String, nullable=False, default="http_request")
    # {"method": "GET", "url": "...", "headers": {...}, "body": "..."} -- values
    # may contain a "{{credential:name}}" placeholder, resolved only in-memory
    # at execution time (see automation_engine.resolve_action_config).
    action_config_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    status: Mapped[str] = mapped_column(String, nullable=False, default="draft")  # draft|active|paused|archived
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class AutomationCredential(Base):
    """A secret bound to one automation (vault: "armazenadas em cofre seguro,
    vinculadas ao escopo correto, mascaradas"). Encrypted at rest with the
    same app.core.security.encrypt_secret/decrypt_secret Fernet helper
    git_provider_repository.py already uses for git tokens -- never a new,
    separately-audited encryption scheme."""

    __tablename__ = "automation_credentials"
    __table_args__ = (Index("idx_automation_credential_automation", "automation_id"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    automation_id: Mapped[str] = mapped_column(String, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)  # referenced as {{credential:name}}
    encrypted_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class AutomationRun(Base):
    """Execution history (vault: "Registra início, fim, ..., entradas
    mascaradas, saídas, duração, custo, status e erro"). Request/response
    bodies are masked before persistence -- never stored in plaintext even
    though they may embed a resolved credential value at execution time."""

    __tablename__ = "automation_runs"
    __table_args__ = (Index("idx_automation_run_automation", "automation_id", "started_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    automation_id: Mapped[str] = mapped_column(String, nullable=False)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    trigger_source: Mapped[str] = mapped_column(String, nullable=False)  # "manual" | "scheduled"
    status: Mapped[str] = mapped_column(String, nullable=False, default="running")  # running|succeeded|failed
    started_at: Mapped[str] = mapped_column(String, nullable=False)
    finished_at: Mapped[str | None] = mapped_column(String, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    masked_request_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True)
    masked_response_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
