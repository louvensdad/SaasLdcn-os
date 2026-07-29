from __future__ import annotations

from app.schemas.common import ApiModel


class StudentVerificationView(ApiModel):
    student_status: str
    student_document: str | None = None
    student_validation_method: str | None = None
    student_verified_at: str | None = None
    student_expires_at: str | None = None
    student_notes: str | None = None
    created_at: str
