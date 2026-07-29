from __future__ import annotations

from pydantic import Field

from app.schemas.common import ApiModel


class FrontendRouteContract(ApiModel):
    path: str
    pageArtifact: str
    protected: bool = False


class FrontendArtifactContract(ApiModel):
    contractVersion: str = "1.0"
    planned: bool = True
    frontendRoot: str
    framework: str
    language: str
    packageManager: str
    entrypoint: str
    applicationRoot: str
    routes: list[FrontendRouteContract] = Field(default_factory=list)
    requiredPages: list[str] = Field(default_factory=list)
    requiredLayouts: list[str] = Field(default_factory=list)
    requiredComponents: list[str] = Field(default_factory=list)
    requiredStores: list[str] = Field(default_factory=list)
    requiredServices: list[str] = Field(default_factory=list)
    apiClient: str
    authenticationArtifacts: list[str] = Field(default_factory=list)
    testFramework: str
    testRoots: list[str] = Field(default_factory=list)
    mockFramework: str | None = None
    requiredDependencies: dict[str, str] = Field(default_factory=dict)
    requiredDevDependencies: dict[str, str] = Field(default_factory=dict)
    forbiddenRoots: list[str] = Field(default_factory=list)
    forbiddenDuplicateArtifacts: list[str] = Field(default_factory=list)
    buildCommand: str
    typeCheckCommand: str
    lintCommand: str
    testCommand: str
    startCommand: str


class FrontendGateResult(ApiModel):
    passed: bool
    blockers: list[str] = Field(default_factory=list)
    details: dict[str, list[str]] = Field(default_factory=dict)
    signals: dict[str, bool] = Field(default_factory=dict)
