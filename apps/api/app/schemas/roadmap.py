from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

RoadmapStatus = Literal["IMPLEMENTED", "IN_PROGRESS", "PLANNED", "FUTURE", "ARCHIVED"]


class RoadmapItem(ApiModel):
    contractVersion: str
    id: str
    title: str
    category: Literal["module", "engine", "registry", "visualization", "template", "skill", "extension"]
    status: RoadmapStatus
    summary: str


class RoadmapResponse(ApiModel):
    contractVersion: str
    items: list[RoadmapItem] = Field(default_factory=list)
    statuses: list[RoadmapStatus] = Field(default_factory=list)
