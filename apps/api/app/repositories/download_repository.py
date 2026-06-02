from __future__ import annotations

from collections.abc import Sequence

from app.data.foundation import DOWNLOADS


class DownloadRepository:
    def list_downloads(self) -> Sequence[dict]:
        return DOWNLOADS
