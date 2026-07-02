from __future__ import annotations

from app.schemas.common import ApiModel


class HealthResponse(ApiModel):
    status: str
    service: str
    version: str
    checks: dict[str, str] | None = None
