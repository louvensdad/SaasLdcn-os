from __future__ import annotations

from fastapi import APIRouter, Query, Response, status

from app.schemas.project import ProjectRecord, ProjectUpdateRequest, SaveProjectFromWizardRequest
from app.services.project_service import ProjectService


router = APIRouter(tags=["projects"])
service = ProjectService()


@router.get("/projects", response_model=list[ProjectRecord])
def list_projects(
    response: Response,
    limit: int | None = Query(None, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[ProjectRecord]:
    # Opt-in pagination (audit B7/M3): no params → full list (unchanged); the total
    # is always exposed via X-Total-Count so a client can page without a second call.
    response.headers["X-Total-Count"] = str(service.count_projects())
    return [ProjectRecord.model_validate(item) for item in service.list_projects(limit=limit, offset=offset)]


@router.post("/projects/save-from-wizard", response_model=ProjectRecord, status_code=status.HTTP_201_CREATED)
def save_project_from_wizard(payload: SaveProjectFromWizardRequest) -> ProjectRecord:
    return ProjectRecord.model_validate(service.save_from_wizard(payload))


@router.get("/projects/{project_id}", response_model=ProjectRecord)
def get_project(project_id: str) -> ProjectRecord:
    return ProjectRecord.model_validate(service.get_project(project_id))


@router.patch("/projects/{project_id}", response_model=ProjectRecord)
def patch_project(project_id: str, payload: ProjectUpdateRequest) -> ProjectRecord:
    return ProjectRecord.model_validate(service.update_project(project_id, payload))


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(project_id: str) -> Response:
    service.delete_project(project_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
