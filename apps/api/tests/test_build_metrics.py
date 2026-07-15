from __future__ import annotations

import tempfile
from pathlib import Path

from app.services.build_validation_service import BuildValidationService, _MetricsCollector
from app.schemas.generation_validation import BuildValidationReport
from fake_execution_runtime import FakeExecutionRuntime


def _sandbox_service() -> BuildValidationService:
    runtime = FakeExecutionRuntime()
    service = BuildValidationService(runtime=runtime)
    service._sandbox_root = Path(".").resolve()
    service._sandbox_id = runtime.open_session(service._sandbox_root, project_id="metrics-test")
    return service


def test_build_run_measures_real_wallclock_and_resources():
    svc = _sandbox_service()
    collector = _MetricsCollector()
    result = svc._run(
        ["python", "-c", "print('ok')"],
        Path("."),
        collector,
        "build",
    )
    assert result.returncode == 0
    metrics = collector.finalize()
    assert metrics is not None
    assert metrics.total_ms >= 0
    assert metrics.build_ms == metrics.total_ms
    assert metrics.sampler == "wallclock"
    assert metrics.peak_memory_mb is None
    assert metrics.cpu_seconds is None

def test_collector_returns_none_when_nothing_ran():
    assert _MetricsCollector().finalize() is None


def test_run_streams_command_events_to_sink():
    svc = _sandbox_service()
    events: list[dict] = []
    result = svc._run(
        ["python", "-c", "print('hello-stdout')"],
        Path("."), None, "build", events.append,
    )
    assert result.returncode == 0
    types = [event["type"] for event in events]
    assert types[0] == "command_started"
    assert "command_finished" in types
    started = events[0]
    assert started["command"] and started["cwd"]
    finished = next(event for event in events if event["type"] == "command_finished")
    assert finished["exitCode"] == 0
    assert finished["durationMs"] is not None
    assert any(
        event["type"] == "command_output" and "hello-stdout" in (event.get("message") or "")
        for event in events
    )

def test_run_missing_binary_is_security_blocked_without_crashing():
    svc = _sandbox_service()
    events: list[dict] = []
    result = svc._run(
        ["ldcn-nonexistent-binary-zzz", "--version"],
        Path("."), None, "build", events.append,
    )
    assert result.returncode == 125
    assert any(event.get("runtimeStatus") == "SECURITY_BLOCKED" for event in events)

def test_dispatch_validates_backend_web_and_mobile_manifests(monkeypatch):
    root = Path(tempfile.mkdtemp(prefix="ldcn-multi-build-"))
    try:
        for relative in ["apps/api/requirements.txt", "apps/web/package.json", "apps/mobile/package.json"]:
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("{}" if path.name == "package.json" else "", encoding="utf-8")

        service = BuildValidationService()
        visited: list[Path] = []

        def passed(target, *_args):  # noqa: ANN001
            visited.append(target)
            return BuildValidationReport(installed="passed", built="passed", ok=True)

        monkeypatch.setattr(service, "_python", passed)
        monkeypatch.setattr(service, "_node", passed)
        report = service._dispatch(root, _MetricsCollector())

        assert report.ok is True
        assert {path.relative_to(root).as_posix() for path in visited} == {"apps/api", "apps/web", "apps/mobile"}
    finally:
        import shutil
        shutil.rmtree(root, ignore_errors=True)


# --- npm E404 auto-repair (hallucinated package names) ----------------------- #

_NPM_404_LOG = """
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@radix-ui%2freact-badge - Not found
npm error 404
npm error 404  The requested resource '@radix-ui/react-badge@^1.0.4' could not be found or you do not have permission to access it.
"""


def _npm_project(dependencies: dict[str, str]) -> Path:
    import json

    root = Path(tempfile.mkdtemp(prefix="ldcn-npm-repair-"))
    (root / "package.json").write_text(
        json.dumps({"name": "x", "version": "1.0.0", "dependencies": dependencies}),
        encoding="utf-8",
    )
    return root


def test_strip_missing_npm_packages_removes_hallucinated_dependency():
    import json

    svc = BuildValidationService()
    root = _npm_project({"@radix-ui/react-badge": "^1.0.4", "react": "^18.2.0"})
    events: list[dict] = []

    removed = svc._strip_missing_npm_packages(root, _NPM_404_LOG, events.append)

    assert removed == ["@radix-ui/react-badge"]
    data = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert "@radix-ui/react-badge" not in data["dependencies"]
    assert data["dependencies"]["react"] == "^18.2.0"  # untouched
    assert any("@radix-ui/react-badge" in e.get("message", "") for e in events)


def test_strip_missing_npm_packages_ignores_unrelated_failures():
    svc = BuildValidationService()
    root = _npm_project({"react": "^18.2.0"})

    # Network failure / engine mismatch: nothing to repair, no manifest rewrite.
    assert svc._strip_missing_npm_packages(root, "npm error code ECONNRESET", None) == []
    # E404 for a package that is not in this manifest: also a no-op.
    assert svc._strip_missing_npm_packages(root, _NPM_404_LOG, None) == []


def test_strip_missing_npm_packages_handles_unscoped_spec_and_lockfile():
    import json

    svc = BuildValidationService()
    root = _npm_project({"left-padz": "^9.9.9"})
    (root / "package-lock.json").write_text("{}", encoding="utf-8")
    log = "npm error 404  The requested resource 'left-padz@^9.9.9' could not be found or you do not have permission to access it."

    removed = svc._strip_missing_npm_packages(root, log, None)

    assert removed == ["left-padz"]
    assert not (root / "package-lock.json").exists()  # stale lock purged for the retry
    data = json.loads((root / "package.json").read_text(encoding="utf-8"))
    assert data["dependencies"] == {}
