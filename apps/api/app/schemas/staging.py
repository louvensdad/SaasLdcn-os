from __future__ import annotations

from typing import Literal

from app.schemas.common import ApiModel

StagingStatus = Literal["stopped", "running", "failed", "unsupported"]


class StagingDeployment(ApiModel):
    project_id: str
    status: StagingStatus
    reason: str = ""
    current_version_id: str | None = None
    previous_version_id: str | None = None
    # Direct http://127.0.0.1:{port}/ URL, same non-proxied approach and same
    # reasoning as live_preview.py's preview_url -- None unless actually running.
    preview_url: str | None = None
    can_rollback: bool = False
    created_at: str
    updated_at: str


class StagingHealthCheck(ApiModel):
    project_id: str
    backend_healthy: bool
    frontend_healthy: bool
    checked_at: str
