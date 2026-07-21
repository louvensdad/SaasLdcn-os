from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class StudentVerificationView(ApiModel):
    student_status: str
    student_document: str | None = None
    student_validation_method: str | None = None
    student_verified_at: str | None = None
    student_expires_at: str | None = None
    student_notes: str | None = None
    created_at: str


class SubmitStudentVerificationRequest(ApiModel):
    # Opaque reference the client already holds (e.g. a URL or storage key) --
    # this codebase has no generic document-upload subsystem to build a real
    # file-storage integration on top of; see student.py's module docstring.
    student_document: str = Field(min_length=1, max_length=2000)
