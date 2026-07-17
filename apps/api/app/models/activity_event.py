from __future__ import annotations
from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base

class ActivityEvent(Base):
    __tablename__ = "activity_events"
    __table_args__ = (Index("idx_activity_events_user_occurred", "user_id", "occurred_at"), Index("idx_activity_events_workspace_occurred", "workspace_id", "occurred_at"), Index("idx_activity_events_category_status", "category", "status"))
    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    workspace_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)
    project_id: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str] = mapped_column(String, nullable=False)
    action: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}", server_default="{}")
    occurred_at: Mapped[str] = mapped_column(String, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String, nullable=False)
    correlation_id: Mapped[str] = mapped_column(String, nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String, nullable=False, default="INFO", server_default="INFO", index=True)
    importance: Mapped[str] = mapped_column(String, nullable=False, default="NORMAL", server_default="NORMAL", index=True)
    evidence_ref: Mapped[str | None] = mapped_column(String, nullable=True)
    resolved_at: Mapped[str | None] = mapped_column(String, nullable=True)
