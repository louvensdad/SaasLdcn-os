from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel


class GeneratedProjectQualityCheck(ApiModel):
    contractVersion: str
    id: str
    label: str
    category: Literal["structure", "manifest", "security", "readme", "env", "blueprint", "zip"]
    status: Literal["passed", "failed", "warning"]
    required: bool
    message: str
    paths: list[str] = Field(default_factory=list)


class GeneratedProjectSecurityFinding(ApiModel):
    contractVersion: str
    code: str
    severity: Literal["warning", "high", "critical"]
    message: str
    path: str | None = None


class GeneratedProjectQualityResponse(ApiModel):
    contractVersion: str
    project_id: str
    framework: str
    template_id: str | None = None
    profile_id: str | None = None
    passed: bool
    failed: bool
    score: int = Field(ge=0, le=100)
    checks: list[GeneratedProjectQualityCheck] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    missing_files: list[str] = Field(default_factory=list)
    security_findings: list[GeneratedProjectSecurityFinding] = Field(default_factory=list)
