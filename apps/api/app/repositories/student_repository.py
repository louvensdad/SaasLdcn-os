from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import select

from app.core.database import database_url_for, session_factory
from app.models.student import StudentVerification

# 12 months, matching the vault's "Revalidar a cada 12 meses por padrão" --
# not a real calendar-month arithmetic dependency, same simplicity level as
# billing_repository.TRIAL_DURATION.
REVALIDATION_PERIOD = timedelta(days=365)
# The vault leaves the post-expiry grace window unstated ("prazo configurável");
# a plain constant here matches TRIAL_DURATION's own level of realism -- no
# fabricated per-org configurability that nothing reads yet.
REVALIDATION_GRACE_PERIOD = timedelta(days=30)

RESUBMITTABLE_STATUSES = ("REJECTED", "REVALIDATION_REQUIRED", "EXPIRED")


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(microsecond=0)


def _as_dict(row: StudentVerification) -> dict[str, Any]:
    return {
        "user_id": row.user_id,
        "student_status": row.student_status,
        "student_document": row.student_document,
        "student_validation_method": row.student_validation_method,
        "student_verified_at": row.student_verified_at,
        "student_expires_at": row.student_expires_at,
        "student_notes": row.student_notes,
        "created_at": row.created_at,
    }


class StudentAlreadySubmittedError(ValueError):
    """Raised when a resubmission is attempted while a submission is already
    PENDING_VERIFICATION or the user is already VERIFIED (not expired)."""


class StudentTransitionError(ValueError):
    """Raised when approve()/reject() is attempted outside PENDING_VERIFICATION."""


class StudentRepository:
    def __init__(self, database: str | None = None) -> None:
        self._sessions = session_factory(database_url_for(database))

    def _latest_row(self, session, user_id: str) -> StudentVerification | None:
        return session.scalar(
            select(StudentVerification)
            .where(StudentVerification.user_id == user_id)
            .order_by(StudentVerification.created_at.desc())
        )

    def latest(self, user_id: str) -> tuple[dict[str, Any] | None, str | None]:
        """Read-only except for the real lazy transitions the vault's own state
        list implies (VERIFIED -> REVALIDATION_REQUIRED once past
        student_expires_at; REVALIDATION_REQUIRED -> EXPIRED once past the
        grace window). Returns (row, transition_event_name | None) so the
        caller emits the matching event exactly once."""
        with self._sessions.begin() as session:
            row = self._latest_row(session, user_id)
            if row is None:
                return None, None
            now = _now()
            if row.student_status == "VERIFIED" and row.student_expires_at and datetime.fromisoformat(row.student_expires_at) <= now:
                next_row = StudentVerification(
                    id=f"stveri_{uuid4().hex[:12]}", user_id=user_id, student_status="REVALIDATION_REQUIRED",
                    student_expires_at=(now + REVALIDATION_GRACE_PERIOD).isoformat(),
                    student_notes="Revalidação da elegibilidade estudantil necessária.",
                    created_at=now.isoformat(),
                )
                session.add(next_row)
                session.flush()
                return _as_dict(next_row), "StudentRevalidationRequested"
            if row.student_status == "REVALIDATION_REQUIRED" and row.student_expires_at and datetime.fromisoformat(row.student_expires_at) <= now:
                next_row = StudentVerification(
                    id=f"stveri_{uuid4().hex[:12]}", user_id=user_id, student_status="EXPIRED",
                    student_notes="Modalidade Estudante expirada sem revalidação.",
                    created_at=now.isoformat(),
                )
                session.add(next_row)
                session.flush()
                return _as_dict(next_row), "StudentVerificationExpired"
            return _as_dict(row), None

    def submit(self, user_id: str, *, student_document: str) -> dict[str, Any]:
        latest, _ = self.latest(user_id)
        if latest is not None and latest["student_status"] not in RESUBMITTABLE_STATUSES:
            raise StudentAlreadySubmittedError(latest["student_status"])
        now = _now()
        with self._sessions.begin() as session:
            row = StudentVerification(
                id=f"stveri_{uuid4().hex[:12]}", user_id=user_id, student_status="PENDING_VERIFICATION",
                student_document=student_document, created_at=now.isoformat(),
            )
            session.add(row)
            session.flush()
            return _as_dict(row)

    def approve(self, user_id: str, *, notes: str | None = None) -> dict[str, Any]:
        """Real business logic, intentionally unreachable via any HTTP route
        this pass -- see student.py's module docstring for why."""
        latest, _ = self.latest(user_id)
        if latest is None or latest["student_status"] != "PENDING_VERIFICATION":
            raise StudentTransitionError((latest or {}).get("student_status"))
        now = _now()
        with self._sessions.begin() as session:
            row = StudentVerification(
                id=f"stveri_{uuid4().hex[:12]}", user_id=user_id, student_status="VERIFIED",
                student_validation_method="manual", student_verified_at=now.isoformat(),
                student_expires_at=(now + REVALIDATION_PERIOD).isoformat(), student_notes=notes,
                created_at=now.isoformat(),
            )
            session.add(row)
            session.flush()
            return _as_dict(row)

    def reject(self, user_id: str, *, reason: str) -> dict[str, Any]:
        """Real business logic, intentionally unreachable via any HTTP route
        this pass -- see student.py's module docstring for why."""
        latest, _ = self.latest(user_id)
        if latest is None or latest["student_status"] != "PENDING_VERIFICATION":
            raise StudentTransitionError((latest or {}).get("student_status"))
        now = _now()
        with self._sessions.begin() as session:
            row = StudentVerification(
                id=f"stveri_{uuid4().hex[:12]}", user_id=user_id, student_status="REJECTED",
                student_notes=reason, created_at=now.isoformat(),
            )
            session.add(row)
            session.flush()
            return _as_dict(row)
