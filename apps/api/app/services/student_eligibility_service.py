from __future__ import annotations

from typing import Any

from app.core.event_catalog import emit_named_event
from app.repositories.student_repository import StudentRepository


class StudentEligibilityService:
    def __init__(self, repository: StudentRepository | None = None) -> None:
        self.repository = repository or StudentRepository()

    def submit(self, user_id: str, *, student_document: str) -> dict[str, Any]:
        record = self.repository.submit(user_id, student_document=student_document)
        emit_named_event("StudentVerificationRequested", user_id, metadata={"status": record["student_status"]})
        return record

    def get(self, user_id: str) -> dict[str, Any] | None:
        record, transition_event = self.repository.latest(user_id)
        if transition_event is not None:
            emit_named_event(transition_event, user_id, metadata={"status": record["student_status"]})
        return record
