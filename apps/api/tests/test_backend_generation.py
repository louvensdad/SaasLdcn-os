from __future__ import annotations

import io
from pathlib import Path
import zipfile


def _stack(framework_id: str) -> dict[str, str]:
    if framework_id == "fastapi":
        return {"language_id": "python", "runtime_id": "python_runtime", "architecture_id": "modular_monolith"}
    if framework_id == "spring_boot":
        return {"language_id": "java", "runtime_id": "jvm", "architecture_id": "modular_monolith"}
    if framework_id == "nestjs":
        return {"language_id": "typescript", "runtime_id": "nodejs", "architecture_id": "modular_monolith"}
    if framework_id == "express":
        return {"language_id": "javascript", "runtime_id": "nodejs", "architecture_id": "modular_monolith"}
    if framework_id == "fastify":
        return {"language_id": "typescript", "runtime_id": "nodejs", "architecture_id": "modular_monolith"}
    raise AssertionError(f"Unsupported framework test fixture: {framework_id}")


def _create_backend_project(client, framework_id: str, *, valid: bool = True) -> dict:
    stack = _stack(framework_id)
    payload = {
        "project_name": f"ldcn-{framework_id}-backend",
        "framework_id": framework_id,
        "archetype_id": "rest_api",
        "capability_ids": ["analytics"] if valid else ["ai_chat"],
        "business_module_ids": ["reports"],
        "endpoint_ids": ["analytics.overview"] if valid else ["ai.chat"],
        "infrastructure_component_ids": ["postgresql"],
        "locale": "pt-BR",
        "generation_mode": "local_build_90",
        "project_requirements": {
            "project_goal": "Deliver a governed backend API.",
            "business_context": "Commercial API operation.",
            "target_users": ["API consumers", "operators"],
            "business_rules": ["Authorized users manage reports."],
            "entities": ["Report", "User"],
            "workflows": ["Consumer requests and operator reviews reports."],
            "constraints": ["Protect credentials."],
            "delivery_target": "github",
        },
        **stack,
    }
    blueprint_response = client.post("/api/blueprints/preview", json=payload)
    assert blueprint_response.status_code == 200
    blueprint = blueprint_response.json()
    prompt_master = client.post("/api/prompt-master/preview", json={"blueprint": blueprint}).json()
    gatekeeper = client.post("/api/gatekeeper/preview", json={"blueprint": blueprint, "prompt_master": prompt_master}).json()
    save_response = client.post(
        "/api/projects/save-from-wizard",
        json={"blueprint": blueprint, "prompt_master": prompt_master, "gatekeeper": gatekeeper},
    )
    assert save_response.status_code == 201
    return save_response.json()


def _request(project: dict, framework_id: str, output: Path, *, profile_id: str | None = None) -> dict:
    stack = _stack(framework_id)
    return {
        "project_id": project["project_id"],
        "target": {
            "language": stack["language_id"],
            "framework": framework_id,
            "output_path": output.as_posix(),
            "project_name": project["project_name"],
        },
        "profile": {
            "profile_id": profile_id or ("basic_rest_api" if framework_id == "spring_boot" else "basic_api"),
            "capabilities": ["postgresql", "health"],
            "database": "postgresql",
            "complexity": "basic",
        },
    }


def test_backend_generation_templates_catalog(client):
    response = client.get("/api/backend-generation/templates")

    assert response.status_code == 200
    payload = response.json()
    templates = {item["framework"]: item for item in payload["templates"]}
    assert templates["fastapi"]["implemented"] is True
    assert templates["spring_boot"]["implemented"] is True
    assert templates["nestjs"]["implemented"] is True
    assert templates["express"]["implemented"] is True
    assert templates["fastify"]["implemented"] is True
    assert templates["quarkus"]["implemented"] is False
    assert templates["micronaut"]["implemented"] is False


def test_backend_generation_fastapi_preview_and_run(client):
    project = _create_backend_project(client, "fastapi")
    output = Path("generated-projects") / "active" / f"backend-fastapi-{project['project_id']}"
    request = _request(project, "fastapi", output, profile_id="crud_api")

    preview = client.post("/api/backend-generation/preview", json=request)
    assert preview.status_code == 200
    preview_payload = preview.json()
    assert preview_payload["status"] == "previewed"
    assert "app/main.py" in preview_payload["file_tree"]
    assert preview_payload["validation"]["generation_enabled"] is True

    response = client.post("/api/backend-generation/run", json=request)
    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["output_path"])
    assert payload["status"] == "generated"
    assert payload["template_id"] == "fastapi-basic-api"
    assert (root / "app" / "main.py").is_file()
    assert (root / "requirements.txt").is_file()
    assert (root / ".ldcn-backend-generation.json").is_file()


def test_backend_generation_spring_boot_run(client):
    project = _create_backend_project(client, "spring_boot")
    output = Path("generated-projects") / "active" / f"backend-spring-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "spring_boot", output, profile_id="basic_rest_api"))

    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["output_path"])
    assert payload["status"] == "generated"
    assert (root / "pom.xml").is_file()
    assert (root / "src" / "main" / "java" / "com" / "ldcn" / "generated" / "controller" / "ItemController.java").is_file()
    assert (root / "src" / "main" / "resources" / "application.yml").is_file()


def test_backend_generation_nestjs_run(client):
    project = _create_backend_project(client, "nestjs")
    output = Path("generated-projects") / "active" / f"backend-nest-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "nestjs", output, profile_id="basic_api"))

    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["output_path"])
    assert payload["status"] == "generated"
    assert (root / "package.json").is_file()
    assert (root / "tsconfig.json").is_file()
    assert (root / "src" / "main.ts").is_file()


def test_backend_generation_express_run(client):
    project = _create_backend_project(client, "express")
    output = Path("generated-projects") / "active" / f"backend-express-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "express", output, profile_id="basic_api"))

    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["output_path"])
    assert payload["status"] == "generated"
    assert payload["template_id"] == "express-basic-api"
    assert (root / "package.json").is_file()
    assert (root / "tsconfig.json").is_file()
    assert (root / "src" / "server.ts").is_file()


def test_backend_generation_fastify_run(client):
    project = _create_backend_project(client, "fastify")
    output = Path("generated-projects") / "active" / f"backend-fastify-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "fastify", output, profile_id="basic_api"))

    assert response.status_code == 200
    payload = response.json()
    root = Path(payload["output_path"])
    assert payload["status"] == "generated"
    assert payload["template_id"] == "fastify-basic-api"
    assert (root / "package.json").is_file()
    assert (root / "tsconfig.json").is_file()
    assert (root / "src" / "server.ts").is_file()


def test_backend_generation_blocked_by_handoff(client):
    project = _create_backend_project(client, "fastapi", valid=False)
    output = Path("generated-projects") / "active" / f"backend-blocked-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "fastapi", output))

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert payload["validation"]["generation_enabled"] is False
    assert any(item["code"] == "invalid_handoff" for item in payload["validation"]["failures"])
    assert not output.exists()


def test_backend_generation_invalid_profile_blocked(client):
    project = _create_backend_project(client, "nestjs")
    output = Path("generated-projects") / "active" / f"backend-invalid-{project['project_id']}"

    response = client.post("/api/backend-generation/run", json=_request(project, "nestjs", output, profile_id="production_api"))

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert any(item["code"] == "unsupported_profile" for item in payload["validation"]["failures"])
    assert not output.exists()


def test_backend_generation_path_traversal_rejected(client):
    project = _create_backend_project(client, "fastapi")
    request = _request(project, "fastapi", Path("../outside"))

    response = client.post("/api/backend-generation/run", json=request)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "blocked"
    assert any(item["code"] == "unsafe_output_path" for item in payload["validation"]["failures"])


def test_backend_generation_manifest_status_and_zip_valid(client):
    project = _create_backend_project(client, "fastapi")
    output = Path("generated-projects") / "active" / f"backend-zip-{project['project_id']}"
    response = client.post("/api/backend-generation/run", json=_request(project, "fastapi", output))
    assert response.status_code == 200
    manifest = response.json()

    status_response = client.get(f"/api/backend-generation/status/{manifest['generation_id']}")
    assert status_response.status_code == 200
    assert status_response.json()["generation_id"] == manifest["generation_id"]
    assert manifest["metrics"]["file_count"] >= 10
    assert manifest["validation"]["security_gate"] == "passed"

    prepare = client.post(f"/api/generation/{project['project_id']}/prepare-download")
    assert prepare.status_code == 200
    download = client.get(f"/api/generation/{project['project_id']}/download")
    assert download.status_code == 200
    with zipfile.ZipFile(io.BytesIO(download.content)) as archive:
        names = archive.namelist()
    assert "app/main.py" in names
    assert ".ldcn-backend-generation.json" in names
    assert all(not name.startswith("../") for name in names)
