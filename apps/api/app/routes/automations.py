from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.core.deps import CurrentUser
from app.schemas.automation import (
    Automation,
    AutomationCredentialSummary,
    AutomationRun,
    CreateAutomationRequest,
    SetAutomationCredentialRequest,
)
from app.services.automation_service import AutomationValidationError, automation_service

router = APIRouter(tags=["automations"])


def _not_found() -> HTTPException:
    return HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Automação não encontrada.")


@router.post("/automations", response_model=Automation, status_code=status.HTTP_201_CREATED)
def create_automation(payload: CreateAutomationRequest, user: CurrentUser) -> Automation:
    try:
        row = automation_service.create(
            owner_user_id=user["user_id"], title=payload.title, workspace_id=payload.workspace_id,
            description=payload.description, trigger_type=payload.trigger_type,
            trigger_config=payload.trigger_config.model_dump(), action_config=payload.action_config.model_dump(),
        )
    except AutomationValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    return Automation.model_validate(row)


@router.get("/automations", response_model=list[Automation])
def list_automations(user: CurrentUser) -> list[Automation]:
    return [Automation.model_validate(row) for row in automation_service.list_for_owner(user["user_id"])]


@router.get("/automations/{automation_id}", response_model=Automation)
def get_automation(automation_id: str, user: CurrentUser) -> Automation:
    row = automation_service.get(automation_id, user["user_id"])
    if row is None:
        raise _not_found()
    return Automation.model_validate(row)


@router.delete("/automations/{automation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_automation(automation_id: str, user: CurrentUser) -> None:
    if not automation_service.delete(automation_id, user["user_id"]):
        raise _not_found()


@router.post("/automations/{automation_id}/activate", response_model=Automation)
def activate_automation(automation_id: str, user: CurrentUser) -> Automation:
    try:
        row = automation_service.activate(automation_id, user["user_id"])
    except AutomationValidationError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    if row is None:
        raise _not_found()
    return Automation.model_validate(row)


@router.post("/automations/{automation_id}/pause", response_model=Automation)
def pause_automation(automation_id: str, user: CurrentUser) -> Automation:
    row = automation_service.pause(automation_id, user["user_id"])
    if row is None:
        raise _not_found()
    return Automation.model_validate(row)


@router.post("/automations/{automation_id}/archive", response_model=Automation)
def archive_automation(automation_id: str, user: CurrentUser) -> Automation:
    row = automation_service.archive(automation_id, user["user_id"])
    if row is None:
        raise _not_found()
    return Automation.model_validate(row)


@router.put("/automations/{automation_id}/credentials", response_model=AutomationCredentialSummary)
def set_automation_credential(automation_id: str, payload: SetAutomationCredentialRequest, user: CurrentUser) -> AutomationCredentialSummary:
    row = automation_service.set_credential(automation_id, user["user_id"], payload.name, payload.value)
    if row is None:
        raise _not_found()
    return AutomationCredentialSummary.model_validate(row)


@router.get("/automations/{automation_id}/credentials", response_model=list[AutomationCredentialSummary])
def list_automation_credentials(automation_id: str, user: CurrentUser) -> list[AutomationCredentialSummary]:
    rows = automation_service.list_credentials(automation_id, user["user_id"])
    if rows is None:
        raise _not_found()
    return [AutomationCredentialSummary.model_validate(row) for row in rows]


@router.delete("/automations/{automation_id}/credentials/{name}", status_code=status.HTTP_204_NO_CONTENT)
def delete_automation_credential(automation_id: str, name: str, user: CurrentUser) -> None:
    deleted = automation_service.delete_credential(automation_id, user["user_id"], name)
    if deleted is None:
        raise _not_found()
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Credencial não encontrada.")


@router.post("/automations/{automation_id}/run", response_model=AutomationRun)
def run_automation_now(automation_id: str, user: CurrentUser) -> AutomationRun:
    row = automation_service.run_now(automation_id, user["user_id"])
    if row is None:
        raise _not_found()
    return AutomationRun.model_validate(row)


@router.get("/automations/{automation_id}/runs", response_model=list[AutomationRun])
def list_automation_runs(automation_id: str, user: CurrentUser) -> list[AutomationRun]:
    rows = automation_service.list_runs(automation_id, user["user_id"])
    if rows is None:
        raise _not_found()
    return [AutomationRun.model_validate(row) for row in rows]
