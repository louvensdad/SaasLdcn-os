from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from app.engines.generated_project_quality_engine import GeneratedProjectQualityEngine
from test_backend_generation import _create_backend_project, _request


def test_env_template_in_subdir_is_not_flagged_as_real_secret_file():
    # Regression: generated projects place .env.example in subdirs (backend/, frontend/).
    # Those are mandatory templates, not real secret files, so they must NOT trip the
    # critical real_env_or_secret_file finding (which would block git export with 409).
    engine = GeneratedProjectQualityEngine()
    root = Path(tempfile.mkdtemp())
    try:
        (root / "backend").mkdir()
        (root / "backend" / ".env.example").write_text(
            "DB_PASSWORD=change-me\nJWT_SECRET=placeholder\n", encoding="utf-8"
        )
        findings: list[dict] = []
        engine._scan_secret_file(root, root / "backend" / ".env.example", findings)
        engine._scan_secret_content(root, root / "backend" / ".env.example", findings)
        assert findings == []

        # A REAL .env (not a template) in a subdir is still a critical finding.
        (root / "backend" / ".env").write_text("X=y", encoding="utf-8")
        real: list[dict] = []
        engine._scan_secret_file(root, root / "backend" / ".env", real)
        assert any(f["code"] == "real_env_or_secret_file" and f["severity"] == "critical" for f in real)
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _generate_backend(client, framework_id: str, *, profile_id: str | None = None) -> tuple[dict, Path]:
    project = _create_backend_project(client, framework_id)
    output = Path("generated-projects") / "active" / f"quality-{framework_id}-{project['project_id']}"
    response = client.post("/api/backend-generation/run", json=_request(project, framework_id, output, profile_id=profile_id))
    assert response.status_code == 200
    manifest = response.json()
    assert manifest["status"] == "generated"
    return project, Path(manifest["output_path"])


def test_fastapi_quality_pass(client):
    project, _ = _generate_backend(client, "fastapi", profile_id="crud_api")

    response = client.post(f"/api/generated-projects/{project['project_id']}/quality-check")

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert payload["failed"] is False
    assert payload["framework"] == "fastapi"
    assert payload["score"] >= 90
    assert payload["missing_files"] == []
    assert payload["security_findings"] == []
    assert any(item["id"] == "fastapi_crud_schemas" and item["status"] == "passed" for item in payload["checks"])


def test_spring_boot_quality_pass(client):
    project, _ = _generate_backend(client, "spring_boot", profile_id="basic_rest_api")

    response = client.post(f"/api/generated-projects/{project['project_id']}/quality-check")

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert payload["framework"] == "spring_boot"
    assert payload["missing_files"] == []
    assert any(item["id"] == "spring_pom" and item["status"] == "passed" for item in payload["checks"])


def test_nestjs_quality_pass(client):
    project, _ = _generate_backend(client, "nestjs", profile_id="basic_api")

    response = client.post(f"/api/generated-projects/{project['project_id']}/quality-check")

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is True
    assert payload["framework"] == "nestjs"
    assert payload["missing_files"] == []
    assert any(item["id"] == "nestjs_package" and item["status"] == "passed" for item in payload["checks"])


def test_missing_file_fails_quality_gate(client):
    project, root = _generate_backend(client, "fastapi", profile_id="crud_api")
    (root / "requirements.txt").unlink()

    response = client.post(f"/api/generated-projects/{project['project_id']}/quality-check")

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is False
    assert payload["failed"] is True
    assert "requirements.txt" in payload["missing_files"]
    assert any(item["id"] == "fastapi_requirements" and item["status"] == "failed" for item in payload["checks"])


def test_secret_detection_fails_quality_gate(client):
    project, root = _generate_backend(client, "fastapi", profile_id="crud_api")
    secret_path = root / "app" / "core" / "secrets.py"
    secret_path.write_text('API_KEY = "sk_live_real_secret_value_12345"\n', encoding="utf-8")

    response = client.post(f"/api/generated-projects/{project['project_id']}/quality-check")

    assert response.status_code == 200
    payload = response.json()
    assert payload["passed"] is False
    assert payload["failed"] is True
    assert any(item["code"] == "hardcoded_secret" for item in payload["security_findings"])
