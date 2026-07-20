from __future__ import annotations

from sqlalchemy import Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class Feature(Base):
    """A planned unit of functional evolution (vault 67 - Features/Modelo de
    Features do projeto.md + 63 - Domain Model/Ciclos de vida das entidades.md).
    Hierarquia: Projeto → Epic → Feature → Task → Change Request -- Epic and
    Task are explicitly NOT built here (no dedicated vault doc found for
    either beyond the one-line hierarchy mention; building them would mean
    inventing their shape). Feature closes the concrete part of that chain
    that ChangeRequest already reserves a column for (`feature_id`)."""

    __tablename__ = "features"
    __table_args__ = (
        Index("idx_feature_project", "project_id"),
        Index("idx_feature_owner", "owner_user_id"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    owner_user_id: Mapped[str] = mapped_column(String, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String, nullable=True)
    # Same id space as ChangeRequest.project_id (the generated-project id) --
    # so ChangeRequest.feature_id can validate against this table directly.
    project_id: Mapped[str] = mapped_column(String, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    problem: Mapped[str] = mapped_column(Text, nullable=False, default="")
    objective: Mapped[str] = mapped_column(Text, nullable=False, default="")
    target_users_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    scope_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    acceptance_criteria_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    dependencies_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")  # list of other Feature ids
    metrics_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    risks_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    priority: Mapped[str] = mapped_column(String, nullable=False, default="medium")  # "low" | "medium" | "high"
    target_version: Mapped[str | None] = mapped_column(String, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="Proposed")
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    updated_at: Mapped[str] = mapped_column(String, nullable=False)
