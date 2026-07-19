from __future__ import annotations

from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel

# Test Runner (55 - Quality Platform/Test Runner.md): "Executar suites
# unitarias, integracao, E2E, visuais, carga, seguranca e acessibilidade de
# forma reproduzivel." Minimal first slice, scope agreed with the user:
# unit/integration only, Python (pytest) + Node (npm test) -- E2E/visual/
# load/security/accessibility suites are a materially larger undertaking,
# deferred. Distinct from functional_completeness_engine.py's
# _tests_completeness(), which is a deliberately fast/free/static file-
# presence heuristic feeding the quality gate score, not a real execution --
# this engine is the first that actually runs the generated project's own
# test suite and reports real pass/fail counts, same "no false pass" bar as
# runtime_functional_test_service.py and runtime_api_audit_service.py.

TestSuiteStatus = Literal["passed", "failed", "skipped", "error"]
TestRunStatus = Literal["passed", "failed", "partially_skipped", "unsupported"]


class TestSuiteResult(ApiModel):
    framework: Literal["pytest", "npm"]
    command: str
    status: TestSuiteStatus
    passed: int | None = None
    failed: int | None = None
    skipped: int | None = None
    total: int | None = None
    duration_ms: int = 0
    logs_tail: str = ""
    reason: str = ""


class TestRunReport(ApiModel):
    run_id: str
    project_id: str
    status: TestRunStatus
    reason: str = ""
    suites: list[TestSuiteResult] = Field(default_factory=list)
    generated_at: str


class RunTestsRequest(ApiModel):
    project_id: str = Field(min_length=1)
