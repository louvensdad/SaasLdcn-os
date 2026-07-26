from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

import app.models  # noqa: F401
from app.core.database import Base, database_url_for, get_engine, session_factory
from app.engines.generation_job_engine import (
    TERMINAL_STATUSES,
    GenerationJobEngine,
    StageFailure,
    StageStalled,
)
from app.models.tenant import WorkspaceMembership
from app.repositories.generation_job_repository import GenerationJobRepository
from app.schemas.orchestrator import ProjectSpec


@pytest.fixture
def isolated_engine():
    root = Path(tempfile.mkdtemp(prefix="ldcn-final-event-"))
    database_path = root / "jobs.db"
    database_url = database_url_for(database_path)
    Base.metadata.create_all(bind=get_engine(database_url))
    with session_factory(database_url).begin() as session:
        session.add(WorkspaceMembership(workspace_id="enterprise", user_id="user-1", role="owner", created_at="2026-01-01T00:00:00+00:00"))
    repository = GenerationJobRepository(database_path)
    engine = GenerationJobEngine(repository, root / "checkpoints")
    try:
        yield engine, repository
    finally:
        get_engine(database_url).dispose()
        shutil.rmtree(root, ignore_errors=True)


def _create(engine: GenerationJobEngine) -> dict:
    return engine.create_job(
        owner_user_id="user-1", project_id="room-1", workspace_id="enterprise",
        project_name="Orders",
        spec=ProjectSpec(raw_intent="Sistema de pedidos", entities=["Order"]),
        blueprint={"decisions": []}, blueprint_version=1,
        provider="anthropic", provider_label="Claude", model="m",
    )


def _final_events(job: dict) -> list[dict]:
    return [event for event in job.get("events", []) if event["type"] == "pipeline_complete"]


# ------------------ pipeline sempre termina com PIPELINE_COMPLETE ------------

def test_pipeline_complete_emitted_on_success(isolated_engine, monkeypatch):
    engine, repository = isolated_engine
    job = _create(engine)
    def successful_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        if step.logical == "build":
            current["buildStatus"] = "PASSED"
            current["partial"] = False
            current["valid"] = True

    monkeypatch.setattr(engine, "_execute_step", successful_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    assert completed["status"] == "READY"
    finals = _final_events(completed)
    assert len(finals) == 1
    assert "PIPELINE_COMPLETE (SUCCESS)" in finals[0]["message"]
    assert completed["finishedAt"]


def test_pipeline_complete_reports_failure_on_degraded_build_skip(isolated_engine, monkeypatch):
    engine, repository = isolated_engine
    job = _create(engine)

    def fake_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        if step.logical == "build":
            current["buildStatus"] = "SKIPPED_AFTER_FAILURE"
            current["manualBuildFixGuide"] = {
                "root_cause": "persistent failure", "original_error": "build failed",
                "affected_files": [], "problematic_dependencies": [], "suggested_versions": {},
                "commands": [], "steps": [], "patches_applied": [], "full_logs": "log",
            }

    monkeypatch.setattr(engine, "_execute_step", fake_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    # SKIPPED_AFTER_FAILURE never blocks: the pipeline still terminates READY
    # (degraded) — a status the frontend treats as terminal-but-actionable.
    assert completed["status"] == "FAILED"
    assert completed["status"] in TERMINAL_STATUSES
    assert completed["partial"] is True
    finals = _final_events(completed)
    assert len(finals) == 1
    assert "PIPELINE_COMPLETE (FAILED)" in finals[0]["message"]
    assert finals[0]["level"] == "warning"
    assert completed["finishedAt"]


def test_pipeline_complete_emitted_on_stage_failure(isolated_engine, monkeypatch):
    engine, repository = isolated_engine
    job = _create(engine)

    def failing_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        raise StageFailure("etapa quebrou", diagnostic={"stage": step.state, "recommended_action": "corrigir", "message": "etapa quebrou"})

    monkeypatch.setattr(engine, "_execute_step", failing_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    assert completed["status"] == "NEEDS_USER_ACTION"
    finals = _final_events(completed)
    assert len(finals) == 1
    assert "PIPELINE_COMPLETE (NEEDS_USER_ACTION)" in finals[0]["message"]
    # finishedAt used to be stamped only on READY; every terminal path has it now.
    assert completed["finishedAt"]


def test_pipeline_complete_emitted_on_stall(isolated_engine, monkeypatch):
    engine, repository = isolated_engine
    job = _create(engine)

    def stalling_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        raise StageStalled("provider nunca respondeu", diagnostic={"stage": step.state, "recommended_action": "retry", "message": "timeout"})

    monkeypatch.setattr(engine, "_execute_step", stalling_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    assert completed["status"] == "STALLED"
    assert "PIPELINE_COMPLETE (STALLED)" in _final_events(completed)[0]["message"]
    assert completed["finishedAt"]


def test_pipeline_complete_emitted_on_unexpected_crash(isolated_engine, monkeypatch):
    engine, repository = isolated_engine
    job = _create(engine)

    def crashing_step(current, owner, step, *args, **kwargs):  # noqa: ANN001
        raise RuntimeError("crash inesperado")

    monkeypatch.setattr(engine, "_execute_step", crashing_step)
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)

    completed = repository.get(job["id"], "user-1")
    assert completed["status"] == "FAILED"
    assert "PIPELINE_COMPLETE (FAILED)" in _final_events(completed)[0]["message"]
    assert completed["finishedAt"]


def test_pause_does_not_emit_final_event(isolated_engine, monkeypatch):
    # PAUSED is a suspension, not a pipeline end — no PIPELINE_COMPLETE.
    engine, repository = isolated_engine
    job = _create(engine)
    engine.pause(job["id"], "user-1")
    engine.execute(job["id"], "user-1", api_key=None, user_model_choice=None)
    paused = repository.get(job["id"], "user-1")
    assert paused["status"] == "PAUSED"
    assert _final_events(paused) == []


def test_degraded_ready_supports_manual_build_retry(isolated_engine, monkeypatch):
    # Estado degradado permite continuar o fluxo: the explicit 'build' stage
    # retry (what the UI button calls) is accepted on a degraded READY job.
    engine, repository = isolated_engine
    job = _create(engine)
    job["status"] = "READY"
    job["currentStage"] = "READY"
    job["buildStatus"] = "SKIPPED_AFTER_FAILURE"
    engine._save(job, "user-1")
    monkeypatch.setattr(engine, "start", lambda *args, **kwargs: None)

    updated = engine.retry_stage(job["id"], "user-1", "build", api_key=None, user_model_choice=None, mode="normal")
    assert updated["manualBuildRetryCount"] == 1
    assert updated["buildStatus"] == "PENDING"
    assert updated["stageStatuses"]["build"] == "retrying"
