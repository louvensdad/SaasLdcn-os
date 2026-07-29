from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse

from app.core.deps import CurrentUser
from app.repositories.student_repository import StudentAlreadySubmittedError
from app.schemas.student_eligibility import StudentVerificationView
from app.services.student_document_storage import (
    content_type_for,
    delete_student_document,
    resolve_student_document_path,
    save_student_document,
)
from app.services.student_eligibility_service import StudentEligibilityService

# Self-service only (vault 56 - Monetização e Consumo/Planos, assinaturas e
# controle de acesso.md, "Plano Estudante e elegibilidade"). Approval is real
# business logic (StudentEligibilityService/StudentRepository) but has no
# route here -- see app/models/student.py's module docstring for why.
router = APIRouter(tags=["billing"])


@router.post("/billing/student/verification", response_model=StudentVerificationView, status_code=status.HTTP_201_CREATED)
async def submit_student_verification(user: CurrentUser, file: UploadFile = File(...)) -> StudentVerificationView:
    """The proof of enrollment is a real uploaded file, stored privately and
    referenced by an opaque, server-generated storage key -- never a raw URL
    the client supplies (correction brief: "Nunca enviar apenas uma URL
    informada pelo usuário")."""
    storage_key = await save_student_document(user["user_id"], file)
    try:
        record = StudentEligibilityService().submit(user["user_id"], student_document=storage_key)
    except StudentAlreadySubmittedError as exc:
        delete_student_document(storage_key)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "STUDENT_VERIFICATION_ALREADY_IN_PROGRESS", "message": f"Já existe uma verificação com status {exc}.", "status": str(exc)},
        ) from exc
    return StudentVerificationView.model_validate(record)


@router.get("/billing/student/verification", response_model=StudentVerificationView | None)
def get_student_verification(user: CurrentUser) -> StudentVerificationView | None:
    record = StudentEligibilityService().get(user["user_id"])
    return StudentVerificationView.model_validate(record) if record else None


@router.get("/billing/student/verification/document")
def get_student_verification_document(user: CurrentUser) -> FileResponse:
    """Owner-only: resolves and streams back the requesting user's OWN latest
    document. No admin/other-user access path exists (see router docstring)."""
    record = StudentEligibilityService().get(user["user_id"])
    if record is None or not record.get("student_document"):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found.")
    path = resolve_student_document_path(record["student_document"])
    return FileResponse(path, media_type=content_type_for(path), filename=f"comprovante{path.suffix}")
