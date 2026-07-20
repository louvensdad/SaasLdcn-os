from __future__ import annotations

import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import get_settings
from app.engines import automation_engine
from app.engines.generation_job_engine import GenerationJobEngine
from app.repositories.automation_repository import AutomationRepository
from app.repositories.generation_job_repository import GenerationJobRepository
from app.repositories.metering_repository import MeteringRepository, current_period_start
from app.repositories.staging_deployment_repository import StagingDeploymentRepository
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.services.execution_runtime import ExecutionResult, ExecutionStatus, RuntimeLimits
from app.services.file_protocol import EmittedFile, ParsedAgentOutput
from app.services.project_writer import ProjectWriter
from app.services.staging_service import STAGING_VERSIONS_ROOT, StagingService
import app.services.staging_service as staging_svc


def _meter() -> MeteringRepository:
    return MeteringRepository(get_settings().sqlite_path)


@pytest.fixture
def client_scoped_engine(client):
    checkpoint_root = Path(tempfile.mkdtemp(prefix="ldcn-metering-test-checkpoints-"))
    repository = GenerationJobRepository(get_settings().sqlite_path)
    engine = GenerationJobEngine(repository, checkpoint_root)
    try:
        yield engine
    finally:
        shutil.rmtree(checkpoint_root, ignore_errors=True)


def test_a_completed_generation_job_records_real_generation_and_token_metering(client, client_scoped_engine, monkeypatch):
    engine = client_scoped_engine
    spec = ProjectSpec(
        raw_intent="Loja", product_summary="Loja online", entities=["Order"], core_workflows=["Criar pedido"],
        suggested_stack=SuggestedStack(language="python", framework="fastapi"), delivery_type="web",
    )
    job = engine.create_job(
        owner_user_id="user-metering-1", project_id="room-metering-1", workspace_id=None,
        project_name="Metering Test", spec=spec, blueprint={"decisions": []}, blueprint_version=1,
        provider="anthropic", provider_label="Claude", model="claude-sonnet-4-6",
    )

    def _fake_agent(router, role, context, model, api_key, language=None, framework=None, model_strategy=None, **_kwargs):
        parsed = ParsedAgentOutput(raw_response="ok")
        if role == "contracts":
            parsed.files.append(EmittedFile("openapi.yaml", "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n"))
        else:
            parsed.files.append(EmittedFile(f"src/{role}/main.ts", "export const x = 1;"))
        return None, parsed

    monkeypatch.setattr("app.engines.generation_job_engine._run_agent", _fake_agent)
    monkeypatch.setattr(engine, "_build", lambda job, owner: None)
    monkeypatch.setattr(engine, "_package", lambda job, owner: None)
    engine.execute(job["id"], "user-metering-1", api_key="secret", user_model_choice="m")

    since = current_period_start()
    assert _meter().sum_for_owner("user-metering-1", "generation_run", since=since) == 1


def test_a_staging_deploy_records_real_metering(client, monkeypatch):
    writer = ProjectWriter()
    result = writer.write(
        [
            EmittedFile(path="requirements.txt", content="fastapi\nuvicorn\n"),
            EmittedFile(path="app/main.py", content="from fastapi import FastAPI\napp = FastAPI()\n"),
            EmittedFile(path="apps/web/package.json", content='{"dependencies": {"next": "14.0.0", "react": "18.0.0", "react-dom": "18.0.0"}}'),
        ],
        project_name="metering-staging-test",
    )
    project_id = result.project_id
    root = Path(result.root_path)
    try:
        fake = SimpleNamespace(
            _sessions={"hostdev_fake": {"root": str(root)}}, evidence_root=root / "_evidence",
            open_session=lambda workspace, **kw: "hostdev_fake", close_session=lambda sandbox_id: None,
            execute=lambda sandbox_id, request, **kw: ExecutionResult(
                execution_id="e", sandbox_id=sandbox_id, status=ExecutionStatus.SUCCEEDED, command="",
                cwd=request.cwd, image="fake", started_at="", finished_at="", exit_code=0,
            ),
            default_limits=lambda timeout_seconds=None: RuntimeLimits(timeout_seconds=timeout_seconds or 60),
            start_background=lambda *a, **k: "bg_1", stop_background=lambda handle_id: None, tail_background=lambda handle_id, **kw: "",
        )
        service = StagingService(host_runtime_factory=lambda: fake)
        monkeypatch.setattr(staging_svc, "_wait_ready", lambda url, **kw: True)

        service.deploy(project_id, "user-metering-2")

        since = current_period_start()
        assert _meter().sum_for_owner("user-metering-2", "staging_deploy", since=since) == 1
    finally:
        shutil.rmtree(root, ignore_errors=True)
        shutil.rmtree(STAGING_VERSIONS_ROOT / project_id, ignore_errors=True)


def test_an_automation_run_records_real_metering_regardless_of_outcome(client, monkeypatch):
    monkeypatch.setattr(automation_engine.httpx, "request", lambda *a, **k: SimpleNamespace(status_code=500, text="boom"))
    monkeypatch.setattr(automation_engine.time, "sleep", lambda _: None)
    repo = AutomationRepository(get_settings().sqlite_path)
    automation = repo.create(owner_user_id="user-metering-3", title="Flaky", action_config={"method": "GET", "url": "https://x"})

    result = automation_engine.run_automation(automation, trigger_source="manual", repository=repo)
    assert result["status"] == "failed"  # metering must count the attempt even though it failed

    since = current_period_start()
    assert _meter().sum_for_owner("user-metering-3", "automation_run", since=since) == 1
