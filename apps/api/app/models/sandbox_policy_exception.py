from __future__ import annotations

from sqlalchemy import Index, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class SandboxPolicyException(Base):
    """A time-bound, approved widening of the sandbox's static program allowlist
    for one project (vault 59 - Segurança de Runtime/Política de isolamento e
    abuso.md, acceptance criterion "Exceções exigem aprovação e expiração").
    Before this, the only way to run a program outside `_ALLOWED_PROGRAMS` in
    app/services/execution_runtime.py was a code change -- no per-project,
    time-bound, approved path existed at all."""

    __tablename__ = "sandbox_policy_exceptions"
    __table_args__ = (
        Index("idx_sandbox_exception_project", "project_id"),
        Index("idx_sandbox_exception_expires_at", "expires_at"),
    )

    id: Mapped[str] = mapped_column(String, primary_key=True)
    project_id: Mapped[str] = mapped_column(String, nullable=False)
    program: Mapped[str] = mapped_column(String, nullable=False)
    reason: Mapped[str] = mapped_column(String, nullable=False)
    approved_by_user_id: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[str] = mapped_column(String, nullable=False)
    expires_at: Mapped[str] = mapped_column(String, nullable=False)
    revoked_at: Mapped[str | None] = mapped_column(String, nullable=True)
