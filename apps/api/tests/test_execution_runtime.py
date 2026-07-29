from __future__ import annotations

import ast
import subprocess
from pathlib import Path

import pytest

from app.core.config import Settings, _validate_production_settings
from app.services.execution_runtime import (
    ExecutionRequest,
    ExecutionStatus,
    HostExecutionRuntime,
    NetworkPolicy,
    SandboxExecutionRuntime,
    redact,
    sanitized_command,
)


def _settings(tmp_path: Path, **overrides) -> Settings:
    values = {
        "environment": "test",
        "execution_runtime": "sandbox",
        "allow_host_execution": False,
        "sandbox_evidence_root": tmp_path / "evidence",
        "sandbox_egress_network": "",
        "sandbox_egress_proxy": "",
    }
    values.update(overrides)
    return Settings(**values)


def test_container_creation_has_hard_isolation_flags(tmp_path, monkeypatch):
    workspace = tmp_path / "project"
    workspace.mkdir()
    (workspace / "package.json").write_text('{"name":"test"}', encoding="utf-8")
    (workspace / ".env").write_text("API_KEY=must-not-copy", encoding="utf-8")
    calls: list[list[str]] = []

    monkeypatch.setattr("app.services.execution_runtime.shutil.which", lambda _: "/usr/bin/docker")

    def control(command: list[str], *, timeout: int):
        calls.append(command)
        return subprocess.CompletedProcess(command, 0, "ok", "")

    monkeypatch.setattr(SandboxExecutionRuntime, "_control", staticmethod(control))
    streamed: list[tuple[Path, str]] = []
    monkeypatch.setattr(
        SandboxExecutionRuntime,
        "_stream_workspace",
        lambda _self, source, container: (
            streamed.append((source, container))
            or subprocess.CompletedProcess([], 0, "", "")
        ),
    )
    runtime = SandboxExecutionRuntime(_settings(tmp_path))
    sandbox_id = runtime.open_session(workspace, project_id="project-1", workspace_id="workspace-1")

    create = calls[0]
    expected = {
        "--network", "none", "--read-only", "--cap-drop", "ALL",
        "--security-opt", "no-new-privileges", "--pids-limit", "--memory",
        "--memory-swap", "--cpus", "--ulimit", "--tmpfs",
    }
    assert expected.issubset(set(create))
    assert not any("docker.sock" in part for part in create)
    assert not any(str(workspace) in part for part in create)  # copied, never bind-mounted
    copied_source = streamed[0][0]
    assert (copied_source / "package.json").exists()
    assert not (copied_source / ".env").exists()
    runtime.close_session(sandbox_id)


def test_command_policy_blocks_shells_docker_and_workspace_escape(tmp_path):
    runtime = SandboxExecutionRuntime(_settings(tmp_path))
    assert "forbidden" in runtime._validate_request(ExecutionRequest(command=("docker", "run", "x"), project_id="p"))
    assert "forbidden" in runtime._validate_request(ExecutionRequest(command=("bash", "-c", "id"), project_id="p"))
    assert "inside" in runtime._validate_request(ExecutionRequest(command=("npm", "test"), project_id="p", cwd="../host"))


def test_network_is_denied_without_internal_proxy_configuration(tmp_path):
    runtime = SandboxExecutionRuntime(_settings(tmp_path))
    session = type("Session", (), {"container_name": "sandbox"})()
    reason = runtime._configure_network(session, NetworkPolicy.PACKAGE_REGISTRY)
    assert "approved sandbox egress proxy" in reason


def test_host_runtime_requires_double_opt_in_and_is_marked_unsafe(tmp_path, caplog):
    import sys

    with pytest.raises(RuntimeError, match="requires EXECUTION_RUNTIME=host"):
        HostExecutionRuntime(_settings(
            tmp_path, environment="development", execution_runtime="host",
            allow_host_execution=False,
        ))

    settings = _settings(
        tmp_path, environment="development", execution_runtime="host",
        allow_host_execution=True,
    )
    runtime = HostExecutionRuntime(settings)
    workspace = tmp_path / "project"
    workspace.mkdir()
    sandbox_id = runtime.open_session(workspace, project_id="dev-project")
    result = runtime.execute(
        sandbox_id,
        ExecutionRequest(
            command=(sys.executable, "-c", "print('local-dev-only')"),
            project_id="dev-project",
        ),
    )
    runtime.close_session(sandbox_id)

    assert result.status == ExecutionStatus.SUCCEEDED
    assert "local-dev-only" in result.stdout
    assert result.image == "host-development-unsafe"
    evidence = (settings.sandbox_evidence_root / f"{result.execution_id}.json").read_text(encoding="utf-8")
    assert '"unsafeHostDevelopment": true' in evidence
    assert "UNSAFE LOCAL DEVELOPMENT MODE" in caplog.text
def test_production_rejects_host_execution(tmp_path):
    settings = _settings(
        tmp_path, environment="production", execution_runtime="host", allow_host_execution=True,
    )
    with pytest.raises(RuntimeError, match="forbidden outside local development"):
        _validate_production_settings(settings)


def test_secret_redaction_covers_key_value_raw_secret_and_url_credentials():
    text = "API_KEY=visible https://user:password@example.com token=abc123"
    clean = redact(text, ("abc123",))
    assert "visible" not in clean
    assert "user:password" not in clean
    assert "abc123" not in clean
    assert clean.count("[redacted]") >= 3
    assert "user:password" not in sanitized_command(("git", "clone", "https://user:password@example.com/repo.git"))


def test_no_process_creation_exists_outside_the_runtime_adapter():
    app_root = Path(__file__).resolve().parents[1] / "app"
    forbidden: list[str] = []
    process_calls = {"Popen", "run", "call", "check_call", "check_output"}
    for path in app_root.rglob("*.py"):
        if path.name == "execution_runtime.py":
            continue
        tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                if isinstance(node.func.value, ast.Name) and node.func.value.id == "subprocess" and node.func.attr in process_calls:
                    forbidden.append(f"{path}:{node.lineno}")
                if isinstance(node.func.value, ast.Name) and node.func.value.id == "os" and node.func.attr == "system":
                    forbidden.append(f"{path}:{node.lineno}")
    assert forbidden == []
