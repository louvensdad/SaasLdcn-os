from __future__ import annotations

from sqlalchemy import ForeignKey, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class StudentVerification(Base):
    """Append-only "registro versionado de elegibilidade estudantil" (vault 56
    - Monetização e Consumo/Planos, assinaturas e controle de acesso.md,
    Persistência section) -- every submission and status transition is a NEW
    row, current status = latest row for the user, same convention already
    used by metering_records/memories.py/subscription_history. Column names
    match the vault's own field list exactly (`student_status`,
    `student_verified_at`, `student_expires_at`, `student_document`,
    `student_validation_method`, `student_notes`).

    Scope confirmed with the user 2026-07-21: only the self-service submission
    half of the lifecycle is exposed via API this pass. `approve`/`reject`
    exist as real repository methods (state machine is fully modeled) but have
    NO route -- there is no platform staff/admin role anywhere in this
    codebase to gate "approve ANOTHER user's document", and inventing one
    would be a much bigger, separate architectural decision than this task.
    """

    __tablename__ = "student_verifications"
    __table_args__ = (Index("idx_student_verifications_user_time", "user_id", "created_at"),)

    id: Mapped[str] = mapped_column(String, primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.user_id"), nullable=False)
    student_status: Mapped[str] = mapped_column(String, nullable=False)
    student_document: Mapped[str | None] = mapped_column(String, nullable=True)
    student_validation_method: Mapped[str | None] = mapped_column(String, nullable=True)
    student_verified_at: Mapped[str | None] = mapped_column(String, nullable=True)
    student_expires_at: Mapped[str | None] = mapped_column(String, nullable=True)
    student_notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
