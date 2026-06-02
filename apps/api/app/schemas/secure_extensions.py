from __future__ import annotations

from typing import Literal

from app.schemas.common import ApiModel


class PlannedSecureExtensionResponse(ApiModel):
    status: Literal["planned"] = "planned"
    active: Literal[False] = False
    message: str = "Feature planned but not active in V1 Foundation."
    phase: Literal["future_secure_extension"] = "future_secure_extension"
