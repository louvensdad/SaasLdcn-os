from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.repositories.student_repository import StudentAlreadySubmittedError
from app.schemas.student_eligibility import StudentVerificationView, SubmitStudentVerificationRequest
from app.services.student_eligibility_service import StudentEligibilityService

# Self-service only (vault 56 - Monetização e Consumo/Planos, assinaturas e
# controle de acesso.md, "Plano Estudante e elegibilidade"). Approval is real
# business logic (StudentEligibilityService/StudentRepository) but has no
# route here -- see app/models/student.py's module docstring for why.
router = APIRouter(tags=["billing"])


@router.post("/billing/student/verification", response_model=StudentVerificationView, status_code=status.HTTP_201_CREATED)
def submit_student_verification(payload: SubmitStudentVerificationRequest, user: CurrentUser) -> StudentVerificationView:
    try:
        record = StudentEligibilityService().submit(user["user_id"], student_document=payload.student_document)
    except StudentAlreadySubmittedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "STUDENT_VERIFICATION_ALREADY_IN_PROGRESS", "message": f"Já existe uma verificação com status {exc}.", "status": str(exc)},
        ) from exc
    return StudentVerificationView.model_validate(record)


@router.get("/billing/student/verification", response_model=StudentVerificationView | None)
def get_student_verification(user: CurrentUser) -> StudentVerificationView | None:
    record = StudentEligibilityService().get(user["user_id"])
    return StudentVerificationView.model_validate(record) if record else None
