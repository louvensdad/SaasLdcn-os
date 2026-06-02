from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class StatusSignal(ApiModel):
    contractVersion: str
    id: str
    label: str
    status: Literal["healthy", "warning", "blocked"]
    detail: str


class PlannedExtensionStatus(ApiModel):
    contractVersion: str
    id: str
    label: str
    status: Literal["inactive"]
    lifecycle: Literal["planned"]
    detail: str


class SystemStatusResponse(ApiModel):
    contractVersion: str
    backend_status: StatusSignal
    frontend_status: StatusSignal
    api_status: StatusSignal
    build_status: StatusSignal
    last_validation: str
    test_coverage: str
    active_modules: list[str] = Field(default_factory=list)
    active_engines: list[str] = Field(default_factory=list)
    active_templates: list[str] = Field(default_factory=list)
    active_skills: list[str] = Field(default_factory=list)
    planned_extensions: list[PlannedExtensionStatus] = Field(default_factory=list)
    registry_health: list[StatusSignal] = Field(default_factory=list)
