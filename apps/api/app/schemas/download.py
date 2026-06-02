from __future__ import annotations

from app.schemas.common import ApiModel


class Download(ApiModel):
    downloadId: str
    projectId: str
    status: str
    artifactPath: str | None = None
