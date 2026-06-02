from __future__ import annotations

from collections.abc import Sequence

from app.repositories.download_repository import DownloadRepository


class DownloadService:
    def __init__(self, repository: DownloadRepository | None = None) -> None:
        self.repository = repository or DownloadRepository()

    def list_downloads(self) -> Sequence[dict]:
        return self.repository.list_downloads()
