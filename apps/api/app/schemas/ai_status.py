from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class AiStatusResponse(ApiModel):
    ai_active: bool
    mode: Literal["ai", "deterministic_preview"]
    providers: list[str] = Field(default_factory=list)
