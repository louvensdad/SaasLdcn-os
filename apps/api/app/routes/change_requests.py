from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Response, status

from app.core.deps import CurrentUser
from app.schemas.change_request import (
    ApproveChangeRequestRequest,
    ChangeRequest,
    ChangeRequestDiff,
    ChangeRequestSummary,
    CreateChangeRequestRequest,
    LlmActionRequest,
    RejectChangeRequestRequest,
    RollbackChangeRequestRequest,
)
from app.services.change_request_service import (
    ChangeRequestAccessError,
    ChangeRequestError,
    ChangeRequestService,
)
from app.services.llm_settings_service import llm_provider_resolver

router = APIRouter(tags=["change-requests"])
service = ChangeRequestService()


def _resolve_api_key(user: dict, *, user_model_choice: str | None, workspace_id: str | None = None) -> str | None:
    context = llm_provider_resolver.resolve(
        workspace_id=workspace_id,
        user_id=user["user_id"],
        requested_capability="change_request",
        requested_model=user_model_choice,
    )
    return context.api_key if context.resolution.mode == "llm" else None


def _require(cr: dict[str, Any] | None) -> dict[str, Any]:
    # 404 (not 403) for a foreign/unknown Change Request: never leak that it exists.
    if cr is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change Request não encontrado.")
    return cr


def _to_model(cr: dict[str, Any]) -> ChangeRequest:
    return ChangeRequest.model_validate(cr)


def _to_summary(cr: dict[str, Any]) -> ChangeRequestSummary:
    return ChangeRequestSummary.model_validate(cr)


@router.get("/change-requests", response_model=list[ChangeRequestSummary])
def list_change_requests(user: CurrentUser, project_id: str | None = None) -> list[ChangeRequestSummary]:
    items = (
        service.list_for_project(project_id, user["user_id"])
        if project_id
        else service.list_for_owner(user["user_id"])
    )
    return [_to_summary(item) for item in items]


@router.post("/change-requests", response_model=ChangeRequest, status_code=status.HTTP_201_CREATED)
def create_change_request(payload: CreateChangeRequestRequest, user: CurrentUser) -> ChangeRequest:
    try:
        cr = service.create(
            owner_user_id=user["user_id"],
            project_id=payload.project_id,
            intent=payload.intent,
            workspace_id=payload.workspace_id,
            room_id=payload.room_id,
            feature_id=payload.feature_id,
            task_id=payload.task_id,
        )
    except ChangeRequestAccessError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return _to_model(cr)


@router.get("/change-requests/{change_request_id}", response_model=ChangeRequest)
def get_change_request(change_request_id: str, user: CurrentUser) -> ChangeRequest:
    return _to_model(_require(service.get(change_request_id, user["user_id"])))


@router.get("/change-requests/{change_request_id}/diff", response_model=ChangeRequestDiff)
def get_change_request_diff(change_request_id: str, user: CurrentUser) -> ChangeRequestDiff:
    cr = _require(service.get(change_request_id, user["user_id"]))
    return ChangeRequestDiff(change_request_id=change_request_id, files=cr.get("diff") or [])


@router.post("/change-requests/{change_request_id}/analyze", response_model=ChangeRequest)
def analyze_change_request(change_request_id: str, payload: LlmActionRequest, user: CurrentUser) -> ChangeRequest:
    api_key = _resolve_api_key(user, user_model_choice=payload.user_model_choice)
    try:
        cr = service.analyze(change_request_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/plan", response_model=ChangeRequest)
def plan_change_request(change_request_id: str, payload: LlmActionRequest, user: CurrentUser) -> ChangeRequest:
    api_key = _resolve_api_key(user, user_model_choice=payload.user_model_choice)
    try:
        cr = service.plan(change_request_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/approve", response_model=ChangeRequest)
def approve_change_request(change_request_id: str, payload: ApproveChangeRequestRequest, user: CurrentUser) -> ChangeRequest:
    try:
        cr = service.approve(change_request_id, user["user_id"], payload.confirmation)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/apply", response_model=ChangeRequest)
def apply_change_request(change_request_id: str, payload: LlmActionRequest, user: CurrentUser) -> ChangeRequest:
    api_key = _resolve_api_key(user, user_model_choice=payload.user_model_choice)
    try:
        cr = service.apply(change_request_id, user["user_id"], api_key=api_key, user_model_choice=payload.user_model_choice)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/accept", response_model=ChangeRequest)
def accept_change_request(change_request_id: str, user: CurrentUser) -> ChangeRequest:
    try:
        cr = service.accept(change_request_id, user["user_id"])
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/reject", response_model=ChangeRequest)
def reject_change_request(change_request_id: str, payload: RejectChangeRequestRequest, user: CurrentUser) -> ChangeRequest:
    try:
        cr = service.reject(change_request_id, user["user_id"], payload.reason)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.post("/change-requests/{change_request_id}/rollback", response_model=ChangeRequest)
def rollback_change_request(change_request_id: str, payload: RollbackChangeRequestRequest, user: CurrentUser) -> ChangeRequest:
    try:
        cr = service.rollback(change_request_id, user["user_id"], payload.reason)
    except ChangeRequestError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=exc.diagnostic()) from exc
    return _to_model(_require(cr))


@router.delete("/change-requests/{change_request_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_change_request(change_request_id: str, user: CurrentUser) -> Response:
    if not service.delete(change_request_id, user["user_id"]):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change Request não encontrado.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
