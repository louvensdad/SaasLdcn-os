from __future__ import annotations

from fastapi import HTTPException, status

from app.core.authorization import PermissionDeniedError, require_permission
from app.core.config import get_settings
from app.repositories.tenant_repository import TenantRepository
from app.repositories.user_repository import AuditLogRepository
from app.services.llm_settings_service import llm_provider_resolver

"""Shared by both the FastAPI route (meta_factory.py) and
GenerationJobCreationService (services/generation_job_creation_service.py) --
split out to break the circular import that would otherwise result from the
service needing these and the route needing the service."""


def _audit(user_id: str, event_code: str) -> None:
    """Best-effort audit trail (never breaks the request if the log is unavailable)."""
    try:
        AuditLogRepository(get_settings().sqlite_path).record(user_id=user_id, event_code=event_code)
    except Exception:  # noqa: BLE001 — audit must never block the user action
        pass


def _generation_llm_context(
    user: dict,
    *,
    workspace_id: str | None,
    user_model_choice: str | None,
    deterministic: bool = False,
):
    context = llm_provider_resolver.resolve(
        workspace_id=workspace_id,
        user_id=user["user_id"],
        requested_capability="meta_factory_pipeline",
        requested_model=user_model_choice,
        deterministic=deterministic,
    )
    if not deterministic and context.resolution.mode != "llm":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "LLM_PROVIDER_REQUIRED",
                "message": context.resolution.reason,
                "recommendedAction": "Configure um provider global ou inicie explicitamente em modo deterministico.",
            },
        )
    return context


def _writable_workspace(user: dict, requested_workspace_id: str | None) -> dict:
    repository = TenantRepository()
    if requested_workspace_id:
        # Permission engine is authoritative for execute_build and audits the decision.
        try:
            require_permission("execute_build", requested_workspace_id, user["user_id"], tenant_repo=repository)
        except PermissionDeniedError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Workspace not found or insufficient permission.",
            ) from exc
        return repository.get_workspace_for_user(requested_workspace_id, user["user_id"])
    workspace = repository.personal_workspace(user["user_id"])
    return workspace or repository.ensure_personal_workspace(user["user_id"], user["full_name"])
