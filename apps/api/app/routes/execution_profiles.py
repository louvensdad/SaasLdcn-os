from __future__ import annotations

from fastapi import APIRouter

from app.registry.execution_profiles_registry import list_execution_profiles
from app.schemas.execution_profile import ExecutionProfileSummary

router = APIRouter(tags=["execution-profiles"])


@router.get("/execution-profiles", response_model=list[ExecutionProfileSummary])
def get_execution_profiles() -> list[ExecutionProfileSummary]:
    return list_execution_profiles()
