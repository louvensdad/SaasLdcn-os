from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class Memory(ApiModel):
    id: str
    scope_type: str
    scope_id: str
    memory_type: str
    content: str
    origin: str
    confidence: float
    expires_at: str | None = None
    status: str
    corrected_from_id: str | None = None
    created_at: str
    updated_at: str


class CorrectMemoryRequest(ApiModel):
    content: str = Field(min_length=1, max_length=2000)
