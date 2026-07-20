from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

TriggerType = Literal["manual", "scheduled"]
AutomationStatus = Literal["draft", "active", "paused", "archived"]


class TriggerConfig(ApiModel):
    cron: str | None = None
    timezone: str = "UTC"


class ActionConfig(ApiModel):
    method: Literal["GET", "POST", "PUT", "PATCH", "DELETE"] = "GET"
    url: str
    headers: dict[str, str] = Field(default_factory=dict)
    body: str | None = None


class Automation(ApiModel):
    id: str
    workspace_id: str | None = None
    title: str
    description: str
    trigger_type: TriggerType
    trigger_config: TriggerConfig
    next_run_at: str | None = None
    action_type: str
    action_config: ActionConfig
    status: AutomationStatus
    created_at: str
    updated_at: str


class CreateAutomationRequest(ApiModel):
    title: str = Field(min_length=1, max_length=200)
    workspace_id: str | None = None
    description: str = ""
    trigger_type: TriggerType = "manual"
    trigger_config: TriggerConfig = Field(default_factory=TriggerConfig)
    action_config: ActionConfig


class SetAutomationCredentialRequest(ApiModel):
    name: str = Field(min_length=1, max_length=80)
    value: str = Field(min_length=1, max_length=4000)


class AutomationCredentialSummary(ApiModel):
    """Never carries the secret value -- name + bookkeeping only."""

    id: str
    name: str
    created_at: str
    updated_at: str


class AutomationRun(ApiModel):
    id: str
    automation_id: str
    trigger_source: Literal["manual", "scheduled"]
    status: Literal["running", "succeeded", "failed"]
    started_at: str
    finished_at: str | None = None
    duration_ms: int | None = None
    masked_request: dict | None = None
    response_status_code: int | None = None
    masked_response: dict | None = None
    error: str | None = None
    retry_count: int
