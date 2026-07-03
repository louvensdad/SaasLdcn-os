from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from app.services.build_validation_service import BuildValidationService, _MetricsCollector
from app.schemas.generation_validation import BuildValidationReport


def test_build_run_measures_real_wallclock_and_resources():
    svc = BuildValidationService()
    collector = _MetricsCollector()
    # A real subprocess in our OWN controlled environment (not legacy code).
    result = svc._run(
        [sys.executable, "-c", "buf = bytearray(8_000_000); print('ok')"],
        Path("."),
        collector,
        "build",
    )
    assert result.returncode == 0
    metrics = collector.finalize()
    assert metrics is not None
    assert metrics.total_ms >= 0
    assert metrics.build_ms == metrics.total_ms
    # psutil is available in this environment -> peak memory / CPU are measured.
    assert metrics.sampler == "psutil"
    assert metrics.peak_memory_mb is not None and metrics.peak_memory_mb > 0
    assert metrics.cpu_seconds is not None


def test_collector_returns_none_when_nothing_ran():
    assert _MetricsCollector().finalize() is None


def test_run_streams_command_events_to_sink():
    svc = BuildValidationService()
    events: list[dict] = []
    result = svc._run(
        [sys.executable, "-c", "print('hello-stdout')"],
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


def test_run_missing_binary_emits_command_skipped_without_crashing():
    svc = BuildValidationService()
    events: list[dict] = []
    # A binary that cannot exist on PATH: must NOT raise (was the WinError 2 crash),
    # must emit a clear command_skipped and return a synthetic failed result.
    result = svc._run(["ldcn-nonexistent-binary-zzz", "--version"], Path("."), None, "build", events.append)
    assert result.returncode == 127
    assert any(event["type"] == "command_skipped" for event in events)


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
