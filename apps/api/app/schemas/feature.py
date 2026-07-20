from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

FeatureStatus = Literal["Proposed", "Planned", "In Progress", "In Review", "Accepted", "Released", "Deprecated"]
FeaturePriority = Literal["low", "medium", "high"]


class Feature(ApiModel):
    id: str
    workspace_id: str | None = None
    project_id: str
    title: str
    problem: str
    objective: str
    target_users: list[str] = Field(default_factory=list)
    scope: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    priority: FeaturePriority
    target_version: str | None = None
    status: FeatureStatus
    created_at: str
    updated_at: str


class CreateFeatureRequest(ApiModel):
    project_id: str = Field(min_length=1)
    title: str = Field(min_length=1, max_length=200)
    workspace_id: str | None = None
    problem: str = ""
    objective: str = ""
    target_users: list[str] = Field(default_factory=list)
    scope: list[str] = Field(default_factory=list)
    acceptance_criteria: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)
    metrics: list[str] = Field(default_factory=list)
    risks: list[str] = Field(default_factory=list)
    priority: FeaturePriority = "medium"
    target_version: str | None = None


class TransitionFeatureStatusRequest(ApiModel):
    status: FeatureStatus
