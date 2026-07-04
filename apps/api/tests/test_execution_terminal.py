from __future__ import annotations

import json
import shutil
import tempfile
from pathlib import Path

import pytest

from app.services.execution_terminal_service import (
    ALLOWED_COMMANDS,
    ExecutionTerminalService,
    execution_terminal_service,
)

_HAS_NPM = shutil.which("npm") is not None
_HAS_GIT = shutil.which("git") is not None


@pytest.fixture
def terminal():
    base = Path(tempfile.mkdtemp(prefix="ldcn-terminal-"))
    workspace = base / "generated" / "active"
    project_root = workspace / "project-1"
    (project_root / "apps" / "web").mkdir(parents=True)
    (project_root / "package.json").write_text(
        json.dumps({"name": "generated-app", "version": "1.0.0", "private": True, "dependencies": {}}),
        encoding="utf-8",
    )
    (project_root / "scripts").mkdir()
    (project_root / "scripts" / "hello.js").write_text("console.log('hello from project');\n", encoding="utf-8")
    service = ExecutionTerminalService(
        timeout_seconds=120,
        sessions_root=base / "sessions",
        workspace_root=workspace,
    )
    project = {"project_id": "project-1", "generated_project_path": str(project_root)}
    try:
        yield service, project, project_root
    finally:
        shutil.rmtree(base, ignore_errors=True)


# ------------------------------------------------------------- security -----

def test_terminal_rejects_non_allowlisted_commands(terminal):
    service, project, _ = terminal
    for command in ["rm -rf /", "curl https://evil.example", "powershell -c calc", "python -c 'x'"]:
        record = service.execute(project, command)
        assert record.status == "rejected", command
        assert record.rejection_reason
        assert record.exit_code is None
    # Rejected attempts are part of the durable audit trail too.
    assert len(service.history("project-1")) == 4


def test_terminal_rejects_shell_metacharacters(terminal):
    service, project, _ = terminal
    record = service.execute(project, "npm install && curl https://evil.example")
    assert record.status == "rejected"
    assert "shell" in record.rejection_reason.lower()


def test_terminal_cwd_is_confined_to_the_project(terminal):
    service, project, _ = terminal
    outside = service.execute(project, "git status", cwd="../..")
    assert outside.status == "rejected"
    assert "isolado" in outside.rejection_reason
    missing = service.execute(project, "git status", cwd="apps/api")
    assert missing.status == "rejected"  # directory does not exist in the project


def test_terminal_refuses_paths_outside_generated_workspace(terminal):
    service, _, _ = terminal
    host_project = {"project_id": "host", "generated_project_path": "C:/Windows"}
    record = service.execute(host_project, "git status")
    assert record.status == "rejected"
    assert "workspace" in record.rejection_reason


def test_node_eval_is_forbidden_and_scripts_must_live_in_project(terminal):
    service, project, _ = terminal
    evil = service.execute(project, 'node -e "process.exit(0)"')
    assert evil.status == "rejected"
    ghost = service.execute(project, "node scripts/nao-existe.js")
    assert ghost.status == "rejected"


def test_terminal_redacts_secrets_in_output(terminal):
    service, project, root = terminal
    (root / "scripts" / "leak.js").write_text(
        "console.log('API_KEY=super-secret-value');\n", encoding="utf-8",
    )
    record = service.execute(project, "node scripts/leak.js")
    if record.status == "rejected":  # node unavailable on the server
        pytest.skip("node is unavailable")
    assert "super-secret-value" not in record.stdout_tail
    assert "[redacted]" in record.stdout_tail


# --------------------------------------------------- real manual execution ---

@pytest.mark.skipif(not _HAS_NPM, reason="npm is unavailable")
def test_user_can_run_npm_install_manually(terminal):
    service, project, root = terminal
    lines: list[tuple[str, str]] = []
    record = service.execute(
        project, "npm install", executed_by="user-1",
        on_line=lambda stream, line: lines.append((stream, line)),
    )
    assert record.status == "completed"
    assert record.exit_code == 0
    assert record.executed_by == "user-1"
    assert (root / "package-lock.json").is_file() or (root / "node_modules").exists()


@pytest.mark.skipif(not _HAS_GIT, reason="git is unavailable")
def test_git_status_streams_real_output(terminal):
    service, project, _ = terminal
    record = service.execute(project, "git status")
    assert record.status == "completed"
    # Not a git repo -> git exits non-zero, but the REAL output reached the user.
    assert record.stderr_tail or record.stdout_tail


# ------------------------------------------------------- persistent logs ----

def test_history_is_persistent_across_service_instances(terminal):
    service, project, _ = terminal
    service.execute(project, "comando-invalido")
    reloaded = ExecutionTerminalService(
        sessions_root=service.sessions_root, workspace_root=service.workspace_root,
    )
    history = reloaded.history("project-1")
    assert len(history) == 1
    assert history[0].command == "comando-invalido"
    assert history[0].status == "rejected"


# --------------------------------- hybrid mode: bounded AI, then the human ---

def test_ai_auto_repair_is_bounded_so_terminal_takes_over():
    """IA nao entra em loop infinito: a politica de auto-reparo e limitada e o
    build vira SKIPPED_AFTER_FAILURE (modo hibrido abre o terminal)."""
    from app.services.build_validation_service import MAX_AUTO_REPAIR_ATTEMPTS, MAX_ATTEMPTS_PER_PHASE

    assert MAX_AUTO_REPAIR_ATTEMPTS == 2
    assert MAX_ATTEMPTS_PER_PHASE == 3  # 1 comando inicial + 2 recuperacoes


def test_pipeline_continues_after_manual_fix(terminal, monkeypatch):
    """Build falhado e corrigivel via terminal e o pipeline continua: apos a
    intervencao manual, o retry explicito da etapa 'build' e aceito."""
    import app.models  # noqa: F401
    from app.core.database import Base, database_url_for, get_engine, session_factory
    from app.engines.generation_job_engine import GenerationJobEngine
    from app.models.tenant import WorkspaceMembership
    from app.repositories.generation_job_repository import GenerationJobRepository
    from app.schemas.orchestrator import ProjectSpec

    service, project, root = terminal
    base = Path(tempfile.mkdtemp(prefix="ldcn-terminal-job-"))
    database_url = database_url_for(base / "jobs.db")
    Base.metadata.create_all(bind=get_engine(database_url))
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    engine = GenerationJobEngine(GenerationJobRepository(base / "jobs.db"), base / "checkpoints")
    try:
        job = engine.create_job(
            owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
            project_name="Orders", spec=ProjectSpec(raw_intent="pedidos", entities=["Order"]),
            blueprint={"decisions": []}, blueprint_version=1,
            provider="anthropic", provider_label="Claude", model="m",
        )
        # AI exhausted its bounded attempts -> degraded terminal state.
        job["status"] = "READY"
        job["currentStage"] = "READY"
        job["buildStatus"] = "SKIPPED_AFTER_FAILURE"
        engine._save(job, "user-1")

        # Human intervenes through the terminal (recorded in the durable history).
        fix = service.execute(project, "comando-de-correcao")  # rejected but audited
        assert fix.id in {item.id for item in service.history("project-1")}

        # Pipeline reactivates the build stage after the manual correction.
        monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)
        updated = engine.retry_stage(job["id"], "user-1", "build", api_key=None, user_model_choice=None, mode="normal")
        assert updated["buildStatus"] == "PENDING"
        assert updated["stageStatuses"]["build"] == "retrying"
        assert updated["manualBuildRetryCount"] == 1
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(base, ignore_errors=True)


# ----------------------------------------------------------- API routes -----

def test_terminal_routes_enforce_ownership_and_persist_history(client, monkeypatch):
    from app.routes import meta_factory as route
    from app.services.project_writer import ProjectWriter

    user_id = client.get("/api/auth/me").json()["user_id"]
    result = ProjectWriter().write(
        [],
        project_name="Terminal Project",
        metadata={},
        owner=user_id,
    )
    project_id = result.project_id
    sessions = Path(tempfile.mkdtemp(prefix="ldcn-terminal-route-"))
    monkeypatch.setattr(
        route, "execution_terminal_service",
        ExecutionTerminalService(sessions_root=sessions),
    )
    try:
        response = client.post(
            f"/api/meta-factory/{project_id}/terminal/execute",
            json={"command": "comando-nao-permitido"},
        )
        assert response.status_code == 200
        frames = [json.loads(line[6:]) for line in response.text.splitlines() if line.startswith("data: ")]
        done = next(frame for frame in frames if frame["type"] == "done")
        assert done["record"]["status"] == "rejected"

        history = client.get(f"/api/meta-factory/{project_id}/terminal/history")
        assert history.status_code == 200
        body = history.json()
        assert len(body["records"]) == 1
        assert body["allowed_commands"]
    finally:
        shutil.rmtree(sessions, ignore_errors=True)


def test_allowlist_covers_essential_commands():
    assert "npm" in ALLOWED_COMMANDS
    for sub in ["install", "run", "test"]:
        assert sub in ALLOWED_COMMANDS["npm"]
    assert "status" in ALLOWED_COMMANDS["git"]
    assert "node" in ALLOWED_COMMANDS
