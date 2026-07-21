from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from app.schemas.language_model import GlossaryTerm, ResolveTermRequest, ResolvedGlossaryTerm, TerminologyValidation, ValidateTermsRequest
from app.services.language_model_service import language_model_service

router = APIRouter(prefix="/language-model", tags=["language-model"])


@router.get("/glossary", response_model=list[GlossaryTerm])
def list_glossary() -> list[GlossaryTerm]:
    return [GlossaryTerm.model_validate(item) for item in language_model_service.glossary()]


@router.get("/glossary/{term_id}", response_model=ResolvedGlossaryTerm)
def get_glossary_term(term_id: str) -> ResolvedGlossaryTerm:
    item = language_model_service.resolve(term_id)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "GLOSSARY_TERM_NOT_FOUND", "term": term_id})
    return ResolvedGlossaryTerm.model_validate(item)


@router.post("/resolve", response_model=ResolvedGlossaryTerm)
def resolve_term(payload: ResolveTermRequest) -> ResolvedGlossaryTerm:
    item = language_model_service.resolve(payload.term)
    if item is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "GLOSSARY_TERM_NOT_FOUND", "term": payload.term})
    return ResolvedGlossaryTerm.model_validate(item)


@router.post("/validate", response_model=TerminologyValidation)
def validate_terms(payload: ValidateTermsRequest) -> TerminologyValidation:
    return TerminologyValidation.model_validate(language_model_service.validate(payload.terms))
