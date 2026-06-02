from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ApiModel(BaseModel):
    model_config = ConfigDict(populate_by_name=True)


class ErrorDetail(ApiModel):
    location: list[str | int] = Field(default_factory=list)
    message: str
    type: str | None = None


class ErrorPayload(ApiModel):
    code: str
    message: str
    details: list[ErrorDetail] = Field(default_factory=list)


class ErrorResponse(ApiModel):
    error: ErrorPayload
