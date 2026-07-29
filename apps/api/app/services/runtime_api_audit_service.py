from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import yaml

from app.schemas.runtime_api_audit import RuntimeApiAuditReport, RuntimeEndpointCheck
from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionRuntime,
    ExecutionStatus,
    NetworkPolicy,
    execution_runtime,
)
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

_BACKEND_CANDIDATES = ("", "apps/api", "backend")
_OPENAPI_SPEC_NAMES = ("openapi.yaml", "openapi.yml", "openapi.json")
_OPENAPI_SPEC_DIRS = (".", "docs")
_MAX_ENDPOINTS = 25
_RESULT_MARKER = "LDCN_RUNTIME_AUDIT_RESULT="

_HARNESS = r'''
import json
import sys
from fastapi.testclient import TestClient
from app.main import app

endpoints = json.loads(sys.argv[1])
client = TestClient(app, raise_server_exceptions=False)
checks = []
for method, path in endpoints:
    try:
        response = client.get(path)
        checks.append({"method": method, "path": path, "status_code": response.status_code,
                       "ok": response.status_code < 500,
                       "detail": "" if response.status_code < 500 else "Endpoint returned a server error."})
    except Exception as exc:
        checks.append({"method": method, "path": path, "status_code": None,
                       "ok": False, "detail": f"{type(exc).__name__}: {exc}"})
print("LDCN_RUNTIME_AUDIT_RESULT=" + json.dumps(checks, separators=(",", ":")))
'''


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


class RuntimeApiAuditService:
    def __init__(self, runtime: ExecutionRuntime | None = None) -> None:
        self.runtime = runtime or execution_runtime

        self.workspace_root = DEFAULT_OUTPUT_ROOT.resolve()

    def audit(self, project: dict[str, Any]) -> RuntimeApiAuditReport:
        project_id = str(project.get("project_id") or "")
        root = self._root(project)
        if root is None:
            return self._report(project_id, supported=False, reason="Generated project not found in the project workspace.")
        backend_root = self._find_python_backend(root)
        if backend_root is None:
            return self._report(
                project_id, supported=False,
                reason="No Python/FastAPI backend detected. Only Python is supported today.",
            )
        endpoints = self._get_only_endpoints(self._load_openapi(root))
        sample = endpoints[:_MAX_ENDPOINTS]
        relative_backend = backend_root.relative_to(root).as_posix() or "."
        sandbox_id = ""
        try:
            sandbox_id = self.runtime.open_session(
                root, project_id=project_id,
                workspace_id=str(project.get("workspace_id") or project.get("workspaceId") or ""),
                job_id=str(project.get("job_id") or project.get("jobId") or ""),
            )
            create = self.runtime.execute(
                sandbox_id,
                ExecutionRequest(
                    command=("python", "-m", "venv", ".ldcn-venv"), project_id=project_id,
                    cwd=relative_backend, limits=self.runtime.default_limits(60), source="runtime-api-audit:prepare",
                ),
            )
            if create.status != ExecutionStatus.SUCCEEDED:
                return self._failed_runtime(project_id, create, "Could not prepare the isolated Python runtime.")
            install = self.runtime.execute(
                sandbox_id,
                ExecutionRequest(
                    command=(".ldcn-venv/bin/pip", "install", "-r", "requirements.txt"),
                    project_id=project_id, cwd=relative_backend, network=NetworkPolicy.PACKAGE_REGISTRY,
                    limits=self.runtime.default_limits(180), source="runtime-api-audit:install",
                ),
            )
            if install.status != ExecutionStatus.SUCCEEDED:
                return self._failed_runtime(project_id, install, "Could not install dependencies in the isolated runtime.")
            run = self.runtime.execute(
                sandbox_id,
                ExecutionRequest(
                    command=(".ldcn-venv/bin/python", "-c", _HARNESS, json.dumps(sample)),
                    project_id=project_id, cwd=relative_backend,
                    limits=self.runtime.default_limits(60), source="runtime-api-audit:harness",
                ),
            )
            if run.status != ExecutionStatus.SUCCEEDED:
                return self._failed_runtime(project_id, run, "The API audit harness failed inside the sandbox.", started=True)
            checks = self._parse_checks(run.stdout)
            crashes = sum(1 for check in checks if not check.ok)
            return self._report(
                project_id, supported=True, language="python", started=True, ready=True,
                checks=checks, endpoints_total=len(endpoints),
                endpoints_skipped=max(0, len(endpoints) - len(sample)), crash_count=crashes,
                reason="" if crashes == 0 else f"{crashes} endpoint(s) returned a 5xx or crashed.",
                startup_log_tail=run.stderr[-8000:] if crashes else "",
            )
        except (OSError, RuntimeError, ValueError) as exc:
            return self._report(
                project_id, supported=True, language="python",
                reason=f"SANDBOX_ERROR: {exc}", startup_log_tail=str(exc)[-8000:],
            )
        finally:
            if sandbox_id:
                self.runtime.close_session(sandbox_id)

    def _failed_runtime(self, project_id: str, result: Any, reason: str, *, started: bool = False) -> RuntimeApiAuditReport:
        detail = result.failure_reason or result.stderr or result.status.value
        return self._report(
            project_id, supported=True, language="python", started=started, ready=False,
            reason=f"{reason} {result.status.value}", startup_log_tail=detail[-8000:],
        )

    def _root(self, project: dict[str, Any]) -> Path | None:
        raw = project.get("generated_project_path")
        if not raw:
            return None
        root = Path(str(raw)).resolve()
        if not root.is_dir() or (root != self.workspace_root and self.workspace_root not in root.parents):
            return None
        return root

    @staticmethod
    def _find_python_backend(root: Path) -> Path | None:
        for candidate in _BACKEND_CANDIDATES:
            candidate_root = (root / candidate).resolve() if candidate else root
            if (candidate_root / "requirements.txt").is_file() and (candidate_root / "app" / "main.py").is_file():
                return candidate_root
        return None

    def _load_openapi(self, root: Path) -> dict[str, Any] | None:
        for dir_name in _OPENAPI_SPEC_DIRS:
            for spec_name in _OPENAPI_SPEC_NAMES:
                path = root / dir_name / spec_name
                if not path.is_file():
                    continue
                try:
                    text = path.read_text(encoding="utf-8", errors="ignore")
                    return json.loads(text) if spec_name.endswith(".json") else yaml.safe_load(text)
                except (OSError, ValueError, yaml.YAMLError):
                    continue
        return None

    @staticmethod
    def _get_only_endpoints(openapi: dict[str, Any] | None) -> list[tuple[str, str]]:
        if not isinstance(openapi, dict) or not isinstance(openapi.get("paths"), dict):
            return []
        out: list[tuple[str, str]] = []
        for path, operations in openapi["paths"].items():
            if isinstance(path, str) and "{" not in path and isinstance(operations, dict) and isinstance(operations.get("get"), dict):
                out.append(("GET", path))
        return sorted(out, key=lambda item: item[1])

    @staticmethod
    def _parse_checks(stdout: str) -> list[RuntimeEndpointCheck]:
        line = next((item for item in reversed(stdout.splitlines()) if item.startswith(_RESULT_MARKER)), "")
        if not line:
            raise ValueError("Sandbox harness did not emit a result record.")
        raw = json.loads(line.removeprefix(_RESULT_MARKER))
        return [RuntimeEndpointCheck.model_validate(item) for item in raw]

    @staticmethod
    def _report(project_id: str, **kwargs: Any) -> RuntimeApiAuditReport:
        return RuntimeApiAuditReport(project_id=project_id, generated_at=_now(), **kwargs)


runtime_api_audit_service = RuntimeApiAuditService()
