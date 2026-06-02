from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class LanguageDomainProfile(ApiModel):
    language_id: str
    name: str
    ecosystem: str
    summary: str
    primary_use_cases: list[str] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    tradeoffs: list[str] = Field(default_factory=list)
    recommended_for: list[str] = Field(default_factory=list)
    framework_count: int
    architecture_count: int
    capability_count: int
    enterprise_score: int
    learning_curve: str
    scalability_profile: str


class LanguageDomainRecommendation(ApiModel):
    language_id: str
    id: str
    title: str
    summary: str
    priority: str
