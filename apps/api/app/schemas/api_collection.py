from __future__ import annotations

from typing import Any, Literal

from pydantic import Field

from app.schemas.common import ApiModel


class GeneratedEndpoint(ApiModel):
    method: str
    path: str
    summary: str | None = None
    operation_id: str | None = None
    x_business_rule: str | None = None


class GeneratedEndpointsResponse(ApiModel):
    project_id: str
    source_path: str
    endpoints: list[GeneratedEndpoint] = Field(default_factory=list)


class ApiCollectionResponse(ApiModel):
    project_id: str
    format: Literal["postman", "insomnia"]
    filename: str
    collection: dict[str, Any]
