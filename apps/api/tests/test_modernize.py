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
