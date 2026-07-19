from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.test_runner import RunTestsRequest, TestRunReport
from app.services.test_runner_service import TestRunnerAccessError, test_runner_service

router = APIRouter(tags=["test-runner"])


@router.post("/test-runner/run", response_model=TestRunReport)
def run_tests(payload: RunTestsRequest, user: CurrentUser) -> TestRunReport:
    try:
        return test_runner_service.run(payload.project_id, user["user_id"])
    except TestRunnerAccessError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
