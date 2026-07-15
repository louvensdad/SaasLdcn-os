from __future__ import annotations

import io
from pathlib import Path
import zipfile

def _build_blueprint(client, *, archetype_id: str = "landing_page", valid: bool = True):
    payload = {
        "project_name": "ldcn-local-landing" if valid else "ldcn-local-blocked",
        "language_id": "typescript",
        "runtime_id": "nodejs",
        "framework_id": "nextjs",
        "architecture_id": "modular_monolith",
        "archetype_id": archetype_id,
        "capability_ids": ["seo", "analytics"] if valid else ["ai_chat"],
        "business_module_ids": ["notifications", "reports"],
        "endpoint_ids": ["analytics.overview"],
        "infrastructure_component_ids": ["vercel", "postgresql"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
        "project_requirements": {
            "project_goal": "Publish a governed landing experience.",
            "business_context": "Commercial marketing operation.",
            "target_users": ["prospects"],
            "business_rules": ["Published content requires approval."],
            "entities": ["Page", "Campaign"],
            "workflows": ["Editor submits and publishes content."],
            "constraints": ["No secrets in static files."],
            "delivery_target": "github",
        },
    }
    response = client.post("/api/blueprints/preview", json=payload)
    assert response.status_code == 200
    return response.json()


def _create_project(client, *, archetype_id: str = "landing_page", valid: bool = True):
    blueprint = _build_blueprint(client, archetype_id=archetype_id, valid=valid)
    prompt_master = client.post("/api/prompt-master/preview", json={"blueprint": blueprint}).json()
    gatekeeper = client.post("/api/gatekeeper/preview", json={"blueprint": blueprint, "prompt_master": prompt_master}).json()
    response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )
    assert response.status_code == 201
    return response.json()


def test_local_generation_invalid_handoff_blocked(client):
    project = _create_project(client, valid=False)
    output = Path("generated-projects") / "temp" / f"blocked-{project['project_id']}"

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": output.as_posix()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert any(item["code"] in {"invalid_handoff", "unsupported_capability"} for item in payload["failures"])


def test_local_generation_unsupported_archetype_blocked(client):
    project = _create_project(client, archetype_id="saas_dashboard", valid=True)
    output = Path("generated-projects") / "temp" / f"unsupported-{project['project_id']}"

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": output.as_posix()},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert any(item["code"] == "unsupported_archetype" for item in payload["failures"])


def test_local_generation_valid_landing_page_generated(client):
    project = _create_project(client)
    output = Path("generated-projects") / "active" / f"landing-{project['project_id']}"

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": output.as_posix()},
    )

    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["file_map"]["root_path"])
    assert payload["status"] == "generated"
    assert payload["template_id"] == "landing-page"
    assert (root / "app" / "page.tsx").is_file()
    assert (root / ".ldcn-generation.json").is_file()
    assert "ldcn-local-landing" in (root / "README.md").read_text(encoding="utf-8")
    persisted = client.get(f"/api/projects/{project['project_id']}").json()
    assert persisted["generated_project_path"] == str(root)


def test_local_generation_file_tree_returned(client):
    project = _create_project(client)
    output = Path("generated-projects") / "active" / f"tree-{project['project_id']}"

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": output.as_posix()},
    )

    assert response.status_code == 200
    payload = response.json()
    paths = {item["relative_path"] for item in payload["file_map"]["files"]}
    assert "README.md" in paths
    assert "package.json" in paths
    assert ".ldcn-generation.json" in paths
    assert "app" in payload["file_map"]["directories"]


def test_local_generation_invalid_path_rejected(client):
    project = _create_project(client)

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": "../outside"},
    )

    assert response.status_code == 400
    assert "traversal" in response.json()["error"]["message"].lower()


def test_local_generation_existing_directory_rejected(client):
    project = _create_project(client)
    existing = Path("generated-projects") / "temp" / f"existing-{project['project_id']}"
    existing.mkdir(parents=True, exist_ok=True)

    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": existing.as_posix()},
    )

    assert response.status_code == 409


def _generate_project(client):
    project = _create_project(client)
    output = Path("generated-projects") / "archived" / f"download-preview-{project['project_id']}"
    response = client.post(
        "/api/generation/local-run",
        json={"project_id": project["project_id"], "output_path": output.as_posix()},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "generated"
    return project, Path(payload["file_map"]["root_path"])


def test_generated_files_list_project_files(client):
    project, _ = _generate_project(client)

    response = client.get(f"/api/generation/{project['project_id']}/files")

    assert response.status_code == 200
    payload = response.json()
    paths = {item["relative_path"] for item in payload["files"]}
    assert "README.md" in paths
    assert "app/page.tsx" in paths
    assert payload["security"]["status"] == "safe"
    assert payload["file_count"] >= 3


def test_generated_file_content_allowed_text_preview(client):
    project, _ = _generate_project(client)

    response = client.get(
        f"/api/generation/{project['project_id']}/file-content",
        params={"path": "README.md"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["preview_supported"] is True
    assert payload["content_type"] == "text"
    assert "ldcn-local-landing" in payload["content"]


def test_generated_file_content_path_traversal_blocked(client):
    project, _ = _generate_project(client)

    response = client.get(
        f"/api/generation/{project['project_id']}/file-content",
        params={"path": "../README.md"},
    )

    assert response.status_code == 400
    assert "traversal" in response.json()["error"]["message"].lower()


def test_generated_file_content_external_absolute_path_blocked(client):
    project, _ = _generate_project(client)

    response = client.get(
        f"/api/generation/{project['project_id']}/file-content",
        params={"path": "C:/Windows/win.ini"},
    )

    assert response.status_code == 400
    assert "traversal" in response.json()["error"]["message"].lower()


def test_generated_files_project_not_generated_returns_clear_error(client):
    project = _create_project(client)

    response = client.get(f"/api/generation/{project['project_id']}/files")

    assert response.status_code == 409
    assert "run local generation first" in response.json()["error"]["message"].lower()


def test_prepare_generated_download_creates_safe_zip(client):
    project, root = _generate_project(client)

    response = client.post(f"/api/generation/{project['project_id']}/prepare-download")

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "prepared"
    assert payload["file_count"] >= 3
    assert payload["zip_size_bytes"] > 0
    assert payload["security"]["status"] == "safe"
    assert Path(payload["download_url"]).as_posix().endswith(f"/api/generation/{project['project_id']}/download")
    assert root.name not in payload["download_url"]

    catalog = client.get("/api/downloads")
    assert catalog.status_code == 200
    record = catalog.json()[0]
    assert record["projectId"] == project["project_id"]
    assert record["status"] == "prepared"
    assert record["downloadUrl"] == payload["download_url"]
    assert len(record["checksumSha256"]) == 64
    assert record["sizeBytes"] == payload["zip_size_bytes"]
    assert "artifactPath" not in record


def test_generated_download_zip_excludes_secret_like_files(client):
    project, root = _generate_project(client)
    (root / ".env").write_text("API_KEY=supersecretvalue12345\n", encoding="utf-8")
    (root / "app" / "visible.txt").write_text("visible file\n", encoding="utf-8")

    prepare = client.post(f"/api/generation/{project['project_id']}/prepare-download")
    assert prepare.status_code == 200
    assert prepare.json()["security"]["status"] == "filtered"
    response = client.get(f"/api/generation/{project['project_id']}/download")

    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
    assert ".env" not in names
    assert "app/visible.txt" in names


def test_generated_download_zip_does_not_include_repo_root(client):
    project, _ = _generate_project(client)

    prepare = client.post(f"/api/generation/{project['project_id']}/prepare-download")
    assert prepare.status_code == 200
    response = client.get(f"/api/generation/{project['project_id']}/download")

    assert response.status_code == 200
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        names = archive.namelist()
    assert all(not name.startswith("../") for name in names)
    assert all(not Path(name).is_absolute() for name in names)
    assert "apps/api/app/main.py" not in names
    assert ".git/config" not in names
    assert "templates/landing-page/manifest.json" not in names


def test_generated_download_returns_application_zip(client):
    project, _ = _generate_project(client)
    prepare = client.post(f"/api/generation/{project['project_id']}/prepare-download")
    assert prepare.status_code == 200

    response = client.get(f"/api/generation/{project['project_id']}/download")

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("application/zip")
    assert response.content.startswith(b"PK")
    assert client.get(f"/api/downloads").json()[0]["status"] == "downloaded"


def test_generated_large_file_preview_returns_limit_error(client):
    project, root = _generate_project(client)
    (root / "large.md").write_text("x" * (64 * 1024 + 1), encoding="utf-8")

    response = client.get(
        f"/api/generation/{project['project_id']}/file-content",
        params={"path": "large.md"},
    )

    assert response.status_code == 413
    assert "limited" in response.json()["error"]["message"].lower()


def test_git_export_preview_passes_quality_gate_and_filters_secrets(client):
    project, root = _generate_project(client)
    (root / ".env").write_text("API_KEY=real-secret-value-that-must-not-export\n", encoding="utf-8")

    response = client.post(
        "/api/git/export/preview",
        json={
            "provider": "github",
            "project_id": project["project_id"],
            "namespace": "ldcn-test",
            "repo_name": "requirements-first",
            "visibility": "private",
            "branch": "main",
            "commit_message": "Initial commit generated by LDCN OS",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert "quality gate failed" in payload["failure_reason"].lower()
    assert ".env" in payload["security_validation"]["blocked_files"]
    assert all(item["relative_path"] != ".env" for item in payload["files_included"])
    assert payload["security_validation"]["contains_secrets"] is False


def test_git_export_requires_connected_provider_account(client):
    project, _ = _generate_project(client)

    response = client.post(
        "/api/git/export/github",
        json={
            "provider": "github",
            "project_id": project["project_id"],
            "namespace": "ldcn-test",
            "repo_name": "requirements-first",
            "visibility": "private",
            "branch": "main",
            "commit_message": "Initial commit generated by LDCN OS",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert "connected provider account" in payload["failure_reason"].lower()
    assert payload["blockers"][0]["action_label"] == "Connect GitHub"
    assert "temporary_token" in payload["security_validation"]["redacted_fields"]
