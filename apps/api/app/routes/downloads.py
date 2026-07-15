from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import CurrentUser
from app.schemas.download import Download
from app.services.download_service import DownloadService

router = APIRouter(tags=["downloads"])
service = DownloadService()


@router.get("/downloads", response_model=list[Download])
def list_downloads(user: CurrentUser) -> list[Download]:
    return [Download.model_validate(record) for record in service.list_downloads(user["user_id"])]