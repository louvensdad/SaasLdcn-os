from __future__ import annotations

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class UserPreferences(Base):
    """Backend-persisted mirror of the Interface/IA settings tabs' client
    preference stores. The frontend still keeps a localStorage copy for
    instant pre-auth paint, but this table is the source of truth that
    survives logout and process restarts. Stored as opaque JSON blobs
    because each tab's preference shape is owned and versioned by its own
    Zustand store; the backend only needs to round-trip it faithfully."""

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    interface_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    personal_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    git_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    advanced_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    locale_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)


class LlmActiveSelection(Base):
    """The active LLM provider/model per user. Replaces the previous
    in-memory-only `dict` in LlmSettingsService, which silently reset to
    'nothing configured' on every backend restart."""

    __tablename__ = "llm_active_selection"

    user_id: Mapped[str] = mapped_column(String, primary_key=True)
    provider: Mapped[str] = mapped_column(String, nullable=False)
    model: Mapped[str] = mapped_column(String, nullable=False)
    validation_status: Mapped[str] = mapped_column(String, nullable=False, default="ready")
    last_validated_at: Mapped[str | None] = mapped_column(String, nullable=True)
    last_used_at: Mapped[str | None] = mapped_column(String, nullable=True)
