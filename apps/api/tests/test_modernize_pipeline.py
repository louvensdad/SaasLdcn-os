from __future__ import annotations

import io
import json
import shutil
import zipfile

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.engines.llm.base import LLMError
from app.repositories.user_repository import AuditLogRepository
from app.routes import modernize
from app.schemas.generated_export import GeneratedProjectExportRequest
from app.services.codebase_ingest_service import INGEST_ROOT
from app.services.project_writer import DEFAULT_OUTPUT_ROOT

INVALID_KEY = "sk-invalid-key-should-never-leak-1234567890"


def _zip_bytes(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    return buf.getvalue()


def _upload(client: TestClient, files: dict[str, str]) -> dict:
    response = client.post(
        "/api/modernize/projects/upload",
        files={"file": ("project.zip", _zip_bytes(files), "application/zip")},
    )
    assert response.status_code == 201, response.text
    return response.json()


def _user_id(client: TestClient) -> str:
    return client.get("/api/auth/me").json()["user_id"]


def _events(user_id: str) -> set[str]:
    return {row["event_code"] for row in AuditLogRepository(get_settings().sqlite_path).list_for_user(user_id)}


def _register_second_user(client: TestClient) -> str:
    response = client.post(
        "/api/auth/register",
        json={"email": f"u_{id(client)}@example.com", "password": "OtherPass123!", "full_name": "B", "privacy_policy_accepted": True},
    )
    return response.json()["tokens"]["access_token"]


@pytest.fixture
def cleanup():
    created: dict[str, list[str]] = {"materialized": [], "ingest": []}
    yield created
    for pid in created["materialized"]:
        shutil.rmtree(DEFAULT_OUTPUT_ROOT / pid, ignore_errors=True)
    for iid in created["ingest"]:
        shutil.rmtree(INGEST_ROOT / iid, ignore_errors=True)


# A project missing README/.env.example, with a hardcoded secret in source (a
# literal ".env" has an empty suffix and is skipped by the ingest allowlist, so the
# secret lives in a scanned .py file instead).
_LEGACY = {
    "app/main.py": "from fastapi import FastAPI\napp = FastAPI()\n",
    "app/controllers/user_controller.py": "def handler():\n    return 1\n",
    "app/settings.py": 'API_KEY = "AKIAIOSFODNN7EXAMPLE12"\nPASSWORD = "supersecret123"\n',
}


def test_zip_upload_safe(client, cleanup):
    project = _upload(client, {"src/app.py": "print('hi')\n"})
    cleanup["ingest"].append(project["project_id"])
    assert project["project_id"].startswith("ingest_")
    assert project["file_count"] >= 1


def test_zip_path_traversal_blocked(client):
    response = client.post(
        "/api/modernize/projects/upload",
        files={"file": ("evil.zip", _zip_bytes({"../evil.py": "x = 1\n"}), "application/zip")},
    )
    assert response.status_code == 400


def test_ignores_node_modules_and_build(client, cleanup):
    project = _upload(client, {
        "src/app.py": "print(1)\n",
        "node_modules/dep/index.js": "module.exports = {}\n",
        "dist/bundle.js": "console.log(1)\n",
        "build/out.js": "console.log(2)\n",
    })
    cleanup["ingest"].append(project["project_id"])
    # Only src/app.py is inventoried; the build/vendor dirs are skipped.
    assert project["file_count"] == 1
    assert project["languages"].get("javascript") is None


@pytest.mark.parametrize(
    "label,provider",
    [("GPT", "openai"), ("DeepSeek", "openrouter"), ("Gemini", "google"), ("Claude", "anthropic")],
)
def test_select_provider_marks_ready(client, label, provider):
    client.post("/api/user-ai-keys", json={"provider": provider, "nome": "Minha chave", "api_key": f"key-for-{provider}-123456"})
    catalog = client.get("/api/modernize/llm/providers").json()["providers"]
    ready = [c for c in catalog if c["id"] == provider and c["status"] == "ready"]
    assert ready, f"{label} ({provider}) should be ready after a key is set"


def test_llm_test_invalid_key_fails(client, monkeypatch):
    client.post("/api/user-ai-keys", json={"provider": "openai", "nome": "Minha chave", "api_key": INVALID_KEY})

    class _FailingRouter:
        def route(self, *a, **k):
            raise LLMError("invalid api key")

    monkeypatch.setattr(modernize, "LLMRouter", _FailingRouter)
    response = client.post("/api/modernize/llm/test", json={"provider": "openai"})
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is False
    assert INVALID_KEY not in json.dumps(body)  # key never leaks


def test_key_never_exposed_in_responses(client):
    client.post("/api/user-ai-keys", json={"provider": "anthropic", "nome": "Minha chave", "api_key": INVALID_KEY})
    status_body = client.get("/api/user-ai-keys").text
    providers_body = client.get("/api/modernize/llm/providers").text
    assert INVALID_KEY not in status_body
    assert INVALID_KEY not in providers_body
    # Only a masked tail is ever surfaced.
    assert "…" in status_body


def test_analysis_generates_executive_and_technical_reports(client, cleanup):
    project = _upload(client, _LEGACY)
    cleanup["ingest"].append(project["project_id"])
    report = client.post(f"/api/modernize/{project['project_id']}/analyze").json()["report"]
    assert report["executive"]["health"]
    assert report["executive"]["risk_level"] in {"low", "medium", "high"}
    assert isinstance(report["technical"]["issues"], list)
    assert len(report["technical"]["issues"]) >= 1  # the hardcoded secret is reported
    assert report["scores"]["security"] < 100


def test_apply_fixes_requires_approval(client, cleanup):
    project = _upload(client, _LEGACY)
    cleanup["ingest"].append(project["project_id"])
    client.post(f"/api/modernize/{project['project_id']}/analyze")
    # No approve-plan call -> apply must be blocked.
    response = client.post(f"/api/modernize/{project['project_id']}/apply-fixes")
    assert response.status_code == 409


def test_full_pipeline_revalidation_and_diff(client, cleanup):
    project = _upload(client, _LEGACY)
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    analyze = client.post(f"/api/modernize/{pid}/analyze").json()
    before_overall = analyze["report"]["scores"]["overall"]

    approve = client.post(f"/api/modernize/{pid}/approve-plan", json={"mode": "full"})
    assert approve.status_code == 200

    fixes = client.post(f"/api/modernize/{pid}/apply-fixes")
    assert fixes.status_code == 200, fixes.text
    materialized = fixes.json()["materialized_project_id"]
    cleanup["materialized"].append(materialized)
    assert fixes.json()["applied_count"] >= 1

    reval = client.post(f"/api/modernize/{pid}/revalidate")
    assert reval.status_code == 200, reval.text
    after_overall = reval.json()["after"]["overall"]
    assert after_overall >= before_overall  # fixes don't regress quality

    diff = client.get(f"/api/modernize/{pid}/diff")
    assert diff.status_code == 200
    assert len(diff.json()["changed_paths"]) >= 1


def test_export_blocked_on_blocker(client, cleanup):
    project = _upload(client, _LEGACY)
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    client.post(f"/api/modernize/{pid}/analyze")
    client.post(f"/api/modernize/{pid}/approve-plan", json={"mode": "critical_only"})
    materialized = client.post(f"/api/modernize/{pid}/apply-fixes").json()["materialized_project_id"]
    cleanup["materialized"].append(materialized)

    # The materialized project still has structural BLOCKERS (unknown framework etc.).
    with pytest.raises(Exception) as blocked:
        modernize._export_generated_project(
            _user_id(client),
            {"project_id": materialized, "generated_project_path": str(DEFAULT_OUTPUT_ROOT / materialized)},
            "github",
            GeneratedProjectExportRequest(namespace="octo", repo_name="m", branch="main", force=False),
        )
    assert getattr(blocked.value, "status_code", None) == 409


def test_workspace_isolation(client, cleanup):
    project = _upload(client, {"src/app.py": "print(1)\n"})
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    other = _register_second_user(client)
    response = client.get(f"/api/modernize/{pid}/report", headers={"Authorization": f"Bearer {other}"})
    assert response.status_code == 404


def test_endpoints_and_api_collection_resolve_after_apply_fixes(client, cleanup):
    # Regression: _materialized_modernize_project() must resolve the job's
    # materialized_project_id, not 404 by treating {project_id} (the ingest id)
    # as if it were the materialized project's own directory.
    project = _upload(client, _LEGACY)
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    client.post(f"/api/modernize/{pid}/analyze")
    client.post(f"/api/modernize/{pid}/approve-plan", json={"mode": "full"})
    materialized = client.post(f"/api/modernize/{pid}/apply-fixes").json()["materialized_project_id"]
    cleanup["materialized"].append(materialized)
    # api_collection_service needs an openapi.yaml on disk; _LEGACY has none,
    # so seed a minimal one directly (the fixture's plain .py files carry no
    # spec) -- the routing/ownership resolution is what this test verifies.
    (DEFAULT_OUTPUT_ROOT / materialized / "openapi.yaml").write_text(
        "openapi: 3.1.0\ninfo:\n  title: x\n  version: 1.0.0\npaths: {}\n", encoding="utf-8"
    )

    endpoints = client.get(f"/api/modernize/{pid}/endpoints")
    assert endpoints.status_code == 200, endpoints.text
    collection = client.get(f"/api/modernize/{pid}/api-collection")
    assert collection.status_code == 200, collection.text


def test_endpoints_and_export_are_owner_scoped_for_job_based_flow(client, cleanup):
    project = _upload(client, _LEGACY)
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    client.post(f"/api/modernize/{pid}/analyze")
    client.post(f"/api/modernize/{pid}/approve-plan", json={"mode": "full"})
    materialized = client.post(f"/api/modernize/{pid}/apply-fixes").json()["materialized_project_id"]
    cleanup["materialized"].append(materialized)

    other = _register_second_user(client)
    headers = {"Authorization": f"Bearer {other}"}
    assert client.get(f"/api/modernize/{pid}/endpoints", headers=headers).status_code == 404
    assert client.get(f"/api/modernize/{pid}/api-collection", headers=headers).status_code == 404
    assert client.post(
        f"/api/modernize/{pid}/export/github",
        headers=headers,
        json={"namespace": "octo", "repo_name": "m", "branch": "main"},
    ).status_code == 404


def test_legacy_one_shot_generate_flow_resolves_endpoints_without_a_job(client, cleanup):
    # /modernize/generate (the older non-job one-shot flow) writes a project
    # directly and never registers a modernize job — _materialized_modernize_project
    # must still resolve it (falling back to treating project_id as the
    # materialized project's own id) instead of 404ing on a project that exists.
    ingest = _upload(client, _LEGACY)
    cleanup["ingest"].append(ingest["project_id"])

    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        generated = client.post(
            "/api/modernize/generate",
            json={"ingest_id": ingest["project_id"], "project_name": "modernized-legacy", "persist": True},
        )
    finally:
        settings.force_mock = previous
    assert generated.status_code == 200, generated.text
    materialized = generated.json()["project_id"]
    assert materialized
    cleanup["materialized"].append(materialized)

    endpoints = client.get(f"/api/modernize/{materialized}/endpoints")
    assert endpoints.status_code == 200, endpoints.text

    # Owner-recorded now (owner=user_id passed to ProjectWriter().write()): a
    # different user must not be able to read it.
    other = _register_second_user(client)
    other_response = client.get(f"/api/modernize/{materialized}/endpoints", headers={"Authorization": f"Bearer {other}"})
    assert other_response.status_code == 404


def test_pipeline_audit_trail(client, cleanup):
    user_id = _user_id(client)
    project = _upload(client, _LEGACY)
    pid = project["project_id"]
    cleanup["ingest"].append(pid)
    client.post(f"/api/modernize/{pid}/analyze")
    client.post(f"/api/modernize/{pid}/approve-plan", json={"mode": "full"})
    materialized = client.post(f"/api/modernize/{pid}/apply-fixes").json()["materialized_project_id"]
    cleanup["materialized"].append(materialized)

    events = _events(user_id)
    assert {"modernize_project_uploaded", "codebase_analysis_started", "codebase_analysis_completed",
            "modernization_plan_approved", "auto_refactor_started", "auto_refactor_completed"} <= events
