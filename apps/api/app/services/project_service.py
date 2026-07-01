from __future__ import annotations

from collections.abc import Sequence

from fastapi import HTTPException, status

from app.repositories.catalog_repository import CatalogRepository
from app.repositories.project_repository import ProjectRepository
from app.repositories.registry_repository import RegistryRepository
from app.schemas.project import ProjectUpdateRequest, SaveProjectFromWizardRequest


class ProjectService:
    def __init__(
        self,
        project_repository: ProjectRepository | None = None,
        catalog_repository: CatalogRepository | None = None,
        registry_repository: RegistryRepository | None = None,
    ) -> None:
        self.project_repository = project_repository or ProjectRepository()
        self.catalog_repository = catalog_repository or CatalogRepository()
        self.registry_repository = registry_repository or RegistryRepository()

    def initialize(self) -> None:
        self.project_repository.initialize()

    def list_projects(self, *, limit: int | None = None, offset: int = 0) -> Sequence[dict]:
        return self.project_repository.list_projects(limit=limit, offset=offset)

    def count_projects(self) -> int:
        return self.project_repository.count_projects()

    def get_project(self, project_id: str) -> dict:
        project = self.project_repository.get_project(project_id)
        if project is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project '{project_id}' was not found.",
            )
        return project

    def save_from_wizard(self, payload: SaveProjectFromWizardRequest) -> dict:
        blueprint = payload.blueprint
        prompt_master = payload.prompt_master
        gatekeeper = payload.gatekeeper

        if prompt_master.blueprint_id != blueprint.blueprint_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Prompt Master blueprint reference does not match the supplied blueprint.",
            )
        if gatekeeper.blueprint_id != blueprint.blueprint_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Gatekeeper blueprint reference does not match the supplied blueprint.",
            )
        if gatekeeper.prompt_master_id != prompt_master.prompt_master_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Gatekeeper Prompt Master reference does not match the supplied Prompt Master.",
            )

        return self.project_repository.save_from_wizard(payload.model_dump())

    def update_project(self, project_id: str, payload: ProjectUpdateRequest | dict) -> dict:
        update_payload = payload.model_dump(exclude_none=True) if isinstance(payload, ProjectUpdateRequest) else payload
        updated = self.project_repository.update_project(project_id, update_payload)
        if updated is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project '{project_id}' was not found.",
            )
        return updated

    def delete_project(self, project_id: str) -> None:
        deleted = self.project_repository.delete_project(project_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Project '{project_id}' was not found.",
            )
