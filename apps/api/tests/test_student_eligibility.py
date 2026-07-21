from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

from app.core.config import get_settings
from app.core.database import session_factory
from app.core.security import decode_token
from app.models.student import StudentVerification
from app.repositories.student_repository import (
    REVALIDATION_GRACE_PERIOD,
    StudentAlreadySubmittedError,
    StudentRepository,
    StudentTransitionError,
)
from app.services.student_document_storage import STORAGE_ROOT
from app.services.student_eligibility_service import StudentEligibilityService

import pytest
from sqlalchemy import select


def _user_id_from(client) -> str:
    token = client.headers["Authorization"].split(" ", 1)[1]
    return str(decode_token(token, expected_type="access")["sub"])


def _upload(client, *, filename: str = "comprovante.pdf", content_type: str = "application/pdf", content: bytes = b"%PDF-1.4 fake enrollment proof"):
    return client.post(
        "/api/billing/student/verification",
        files={"file": (filename, io.BytesIO(content), content_type)},
    )


def test_get_student_verification_is_null_before_any_submission(client):
    response = client.get("/api/billing/student/verification")
    assert response.status_code == 200
    assert response.json() is None


def test_submit_creates_a_pending_verification_record_and_stores_the_file_privately(client):
    response = _upload(client)
    assert response.status_code == 201
    body = response.json()
    assert body["student_status"] == "PENDING_VERIFICATION"
    # The stored reference is a server-generated storage key, never the raw
    # filename or any client-supplied value -- see the route's docstring.
    assert body["student_document"] is not None
    assert body["student_document"] != "comprovante.pdf"
    stored_path = STORAGE_ROOT / body["student_document"]
    assert stored_path.is_file()
    assert stored_path.read_bytes() == b"%PDF-1.4 fake enrollment proof"

    fetched = client.get("/api/billing/student/verification").json()
    assert fetched["student_status"] == "PENDING_VERIFICATION"


def test_submit_rejects_an_unsupported_file_type(client):
    response = _upload(client, filename="comprovante.docx", content_type="application/msword")
    assert response.status_code == 422
    assert response.json()["detail"]["code"] == "STUDENT_DOCUMENT_UNSUPPORTED_TYPE"
    # Nothing should have been written to disk for a rejected upload.
    assert client.get("/api/billing/student/verification").json() is None


def test_submit_rejects_a_file_over_the_configured_limit(client):
    get_settings().student_document_max_upload_bytes = 10
    response = _upload(client, content=b"x" * 1000)
    assert response.status_code == 413
    assert response.json()["detail"]["code"] == "STUDENT_DOCUMENT_TOO_LARGE"
    assert client.get("/api/billing/student/verification").json() is None


def test_submit_rejects_an_empty_file(client):
    response = _upload(client, content=b"")
    assert response.status_code == 400
    assert response.json()["detail"]["code"] == "STUDENT_DOCUMENT_EMPTY"


def test_get_document_streams_back_the_owners_own_file(client):
    upload = _upload(client, content_type="image/png", filename="comprovante.png", content=b"\x89PNG fake bytes")
    assert upload.status_code == 201

    response = client.get("/api/billing/student/verification/document")
    assert response.status_code == 200
    assert response.headers["content-type"] == "image/png"
    assert response.content == b"\x89PNG fake bytes"


def test_get_document_is_404_before_any_submission(client):
    response = client.get("/api/billing/student/verification/document")
    assert response.status_code == 404


def test_resubmitting_while_pending_is_rejected(client):
    _upload(client)
    response = _upload(client)
    assert response.status_code == 409
    assert response.json()["detail"]["code"] == "STUDENT_VERIFICATION_ALREADY_IN_PROGRESS"


def test_resubmitting_after_rejection_is_allowed(client):
    user_id = _user_id_from(client)
    _upload(client)
    StudentRepository(get_settings().sqlite_path).reject(user_id, reason="Documento ilegível")

    response = _upload(client)
    assert response.status_code == 201
    assert response.json()["student_status"] == "PENDING_VERIFICATION"


def test_approve_and_reject_are_real_but_not_exposed_via_any_route(client):
    """Scope confirmed with the user 2026-07-21: no platform staff/admin role
    exists to gate an "approve ANOTHER user's document" endpoint. The state
    machine itself must still be correct -- exercised here directly against
    the repository/service, the same way this codebase already tests
    resource_entitlements' internal mechanics without a cross-user route."""
    user_id = _user_id_from(client)
    repository = StudentRepository(get_settings().sqlite_path)
    _upload(client)

    approved = repository.approve(user_id, notes="Carteira estudantil válida")
    assert approved["student_status"] == "VERIFIED"
    assert approved["student_validation_method"] == "manual"
    assert approved["student_verified_at"] is not None
    assert approved["student_expires_at"] is not None

    fetched = client.get("/api/billing/student/verification").json()
    assert fetched["student_status"] == "VERIFIED"

    with pytest.raises(StudentTransitionError):
        repository.approve(user_id)  # already VERIFIED, not PENDING_VERIFICATION

    with pytest.raises(StudentAlreadySubmittedError):
        repository.submit(user_id, student_document="doc-2")  # still VERIFIED, not resubmittable


def test_reject_records_the_reason(client):
    user_id = f"user_{id(object())}"
    repository = StudentRepository(get_settings().sqlite_path)
    repository.submit(user_id, student_document="doc-1")

    rejected = repository.reject(user_id, reason="Comprovante vencido")
    assert rejected["student_status"] == "REJECTED"
    assert rejected["student_notes"] == "Comprovante vencido"

    # A rejection is resubmittable.
    resubmitted = repository.submit(user_id, student_document="doc-2")
    assert resubmitted["student_status"] == "PENDING_VERIFICATION"


def _force_verified_row_expiry(user_id: str, *, past: bool) -> None:
    sessions = session_factory(get_settings().sqlite_path)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    expires_at = (now - timedelta(seconds=1)) if past else (now + timedelta(days=1))
    with sessions.begin() as session:
        row = session.scalar(
            select(StudentVerification).where(StudentVerification.user_id == user_id).order_by(StudentVerification.created_at.desc())
        )
        row.student_expires_at = expires_at.isoformat()


def test_verified_lazily_transitions_to_revalidation_required_after_expiry(client):
    user_id = _user_id_from(client)
    repository = StudentRepository(get_settings().sqlite_path)
    repository.submit(user_id, student_document="doc-1")
    repository.approve(user_id)
    _force_verified_row_expiry(user_id, past=True)

    fetched = client.get("/api/billing/student/verification").json()
    assert fetched["student_status"] == "REVALIDATION_REQUIRED"


def test_revalidation_required_lazily_expires_after_the_grace_window(client):
    user_id = _user_id_from(client)
    repository = StudentRepository(get_settings().sqlite_path)
    repository.submit(user_id, student_document="doc-1")
    repository.approve(user_id)
    _force_verified_row_expiry(user_id, past=True)
    client.get("/api/billing/student/verification")  # triggers VERIFIED -> REVALIDATION_REQUIRED

    _force_verified_row_expiry(user_id, past=True)  # push the REVALIDATION_REQUIRED row's own deadline into the past too

    fetched = client.get("/api/billing/student/verification").json()
    assert fetched["student_status"] == "EXPIRED"


def test_revalidation_grace_period_is_configured_as_a_real_constant():
    assert REVALIDATION_GRACE_PERIOD == timedelta(days=30)


def test_student_eligibility_service_emits_requested_event(client):
    user_id = _user_id_from(client)
    from app.repositories.activity_event_repository import activity_event_repository

    StudentEligibilityService().submit(user_id, student_document="doc-1")
    events = activity_event_repository.list_for_user(user_id, workspace_id=None, limit=50)
    assert any(event["action"] == "student_verification_requested" for event in events)
