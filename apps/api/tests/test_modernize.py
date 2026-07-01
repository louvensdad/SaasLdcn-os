from __future__ import annotations

import io
import zipfile

from app.core.config import get_settings


def _zip(files: dict[str, str]) -> bytes:
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    return buffer.getvalue()


_LEGACY = {
    "app/controllers/user_controller.py": (
        "# Controller with business logic inline (smell)\n"
        "def create_user(req):\n"
        "    password = \"supersecret123\"  # hardcoded\n"
        "    return {'ok': True}\n"
    ),
    "app/models/user.py": "class User:\n    pass\n",
    "requirements.txt": "flask==0.12\n",
    "config/settings.py": "AWS_KEY = 'AKIAIOSFODNN7EXAMPLE'\n",
}


def test_ingest_zip_diagnoses_and_plans(client):
    response = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("legacy.zip", _zip(_LEGACY), "application/zip")},
    )
    assert response.status_code == 200, response.text
    body = response.json()

    inv = body["inventory"]
    assert inv["source"] == "zip"
    assert inv["file_count"] == 4
    assert inv["ingest_id"].startswith("ingest_")

    diag = body["diagnosis"]
    assert diag["primary_language"] == "python"
    # Hardcoded password + AWS key must be flagged.
    codes = {f["code"] for f in diag["security_findings"]}
    assert "hardcoded_password" in codes
    assert "aws_access_key" in codes
    # Obsolete Flask 0.x dependency note.
    assert any("Flask" in note for note in diag["dependency_notes"])

    plan = body["plan"]
    # The controller is migrated into the interface layer; logic is preserved.
    controller = next(m for m in plan["mappings"] if m["legacy_path"].endswith("user_controller.py"))
    assert controller["target_path"].startswith("apps/api/app/interface/")
    assert "PRESERV" in plan["preserved_logic_note"].upper()


def test_ingest_zip_rejects_zip_slip(client):
    malicious = io.BytesIO()
    with zipfile.ZipFile(malicious, "w") as zf:
        zf.writestr("../../evil.py", "print('pwned')\n")
    response = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("evil.zip", malicious.getvalue(), "application/zip")},
    )
    assert response.status_code == 400
    assert "unsafe" in response.text.lower()


def test_ingest_git_rejects_local_remote(client):
    response = client.post(
        "/api/modernize/ingest/git",
        json={"git_url": "file:///etc/passwd"},
    )
    assert response.status_code == 400


def test_modernize_ask_is_grounded_and_deterministic(client):
    ingest = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("legacy.zip", _zip(_LEGACY), "application/zip")},
    ).json()
    ingest_id = ingest["inventory"]["ingest_id"]

    # Security question -> grounded on real findings, honestly marked deterministic.
    response = client.post(
        "/api/modernize/ask",
        json={"ingest_id": ingest_id, "question": "Quais os problemas de seguranca?"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["mode"] == "deterministic"
    assert "security_findings" in body["grounded_on"]
    assert body["answer"]

    # Unknown ingest id -> 404 (never fabricates an answer).
    missing = client.post("/api/modernize/ask", json={"ingest_id": "ingest_does_not_exist", "question": "x"})
    assert missing.status_code == 404


def test_modernize_runtime_profile_is_measured_not_executed(client):
    files = {
        "app/main.py": "import asyncio\nfrom fastapi import FastAPI\napp = FastAPI()\n\n@app.get('/x')\nasync def x():\n    return {}\n",
        "requirements.txt": "fastapi\nuvicorn\npydantic\n",
        "Dockerfile": "FROM python:3.12\n",
    }
    ingest = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("legacy.zip", _zip(files), "application/zip")},
    ).json()
    ingest_id = ingest["inventory"]["ingest_id"]

    response = client.post("/api/modernize/runtime-profile", json={"ingest_id": ingest_id})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["executed"] is False  # legacy code is never executed
    by_id = {m["id"]: m for m in body["metrics"]}
    assert by_id["deps"]["value"] == "3" and by_id["deps"]["kind"] == "measured"
    assert by_id["entrypoints"]["value"] == "1"
    assert int(by_id["endpoints"]["value"]) >= 1  # @app.get detected
    assert by_id["concurrency"]["value"] == "async/await"
    assert by_id["container"]["value"] == "Pronto"
    # Estimates are present and explicitly labeled (never "measured").
    assert by_id["coldstart"]["kind"] == "estimate"
    assert by_id["memory"]["kind"] == "estimate"

    missing = client.post("/api/modernize/runtime-profile", json={"ingest_id": "ingest_nope"})
    assert missing.status_code == 404


def test_latest_project_is_null_for_fresh_user(client):
    # A brand-new user has no analyses: Auto-Fix must show its empty state, not upload.
    response = client.get("/api/modernize/projects/latest")
    assert response.status_code == 200, response.text
    assert response.json() is None


def test_project_upload_returns_diagnosis_and_latest_tracks_analysis(client):
    # Modernize ingest now creates a persistent job AND returns the diagnosis bundle.
    upload = client.post(
        "/api/modernize/projects/upload",
        files={"file": ("legacy.zip", _zip(_LEGACY), "application/zip")},
    )
    assert upload.status_code == 201, upload.text
    body = upload.json()
    project_id = body["project_id"]
    assert project_id.startswith("ingest_")
    assert body["inventory"]["ingest_id"] == project_id
    assert body["executive_summary"] is not None
    assert body["diagnosis"]["primary_language"] == "python"

    # Latest points at it; no report yet (analyze hasn't run).
    latest = client.get("/api/modernize/projects/latest").json()
    assert latest["project_id"] == project_id
    assert latest["has_report"] is False
    assert latest["file_count"] >= 1

    # Running the analysis persists report + plan; latest reflects it.
    analyze = client.post(f"/api/modernize/{project_id}/analyze")
    assert analyze.status_code == 200, analyze.text
    assert "report" in analyze.json() and "plan" in analyze.json()

    report = client.get(f"/api/modernize/{project_id}/report")
    assert report.status_code == 200, report.text
    assert report.json()["report"]["project_id"] == project_id

    latest_after = client.get("/api/modernize/projects/latest").json()
    assert latest_after["has_report"] is True
    assert latest_after["overall_score"] is not None
    assert latest_after["findings_count"] is not None

    # The list endpoint surfaces the same analysis.
    listed = client.get("/api/modernize/projects").json()
    assert any(p["project_id"] == project_id for p in listed)


def test_modernize_generate_in_mock_mode(client):
    ingest = client.post(
        "/api/modernize/ingest/zip",
        files={"file": ("legacy.zip", _zip(_LEGACY), "application/zip")},
    ).json()

    settings = get_settings()
    previous = settings.force_mock
    settings.force_mock = True
    try:
        response = client.post(
            "/api/modernize/generate",
            json={"ingest_id": ingest["inventory"]["ingest_id"], "project_name": "modernized", "persist": True},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["ok"] is True, body["errors"]
        assert body["degraded"] is True
        assert body["written"] is True
        assert body["file_count"] > 0
        assert body["project_id"]
    finally:
        settings.force_mock = previous
