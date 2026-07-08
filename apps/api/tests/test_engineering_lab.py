from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.engines.engineering_lab_engine import engineering_lab_engine
from app.services.file_protocol import EmittedFile
from app.services.project_writer import DEFAULT_OUTPUT_ROOT, ProjectWriter


def _project_root(project_id: str) -> Path:
    root = DEFAULT_OUTPUT_ROOT / project_id
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    return root


def _register_second_user(client: TestClient) -> str:
    response = client.post(
        "/api/auth/register",
        json={
            "email": f"other_{uuid4().hex}@example.com",
            "password": "OtherPassword123!",
            "full_name": "Other User",
            "privacy_policy_accepted": True,
        },
    )
    assert response.status_code in (200, 201), response.text
    return response.json()["tokens"]["access_token"]


def test_engineering_lab_overview_uses_real_project_files() -> None:
    project_id = "lab-test-project"
    root = _project_root(project_id)
    try:
        (root / "package.json").write_text(
            '{"scripts":{"build":"next build","test":"vitest"},"dependencies":{"next":"^15.0.0"}}',
            encoding="utf-8",
        )
        (root / "src").mkdir()
        (root / "src" / "api.ts").write_text("app.get('/health', () => {})\n", encoding="utf-8")
        (root / "Dockerfile").write_text("FROM node:22\n", encoding="utf-8")

        overview = engineering_lab_engine.overview(project_id)

        assert overview.project_id == project_id
        assert overview.file_count >= 3
        assert overview.line_count >= 3
        assert overview.dependency_count == 1
        assert overview.stack == "Node.js"
        assert overview.api_endpoints[0].method == "GET"
        assert overview.api_endpoints[0].path == "/health"
        assert "Dockerfile" in overview.containers
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_terminal_rejects_unapproved_executable() -> None:
    project_id = "lab-test-terminal"
    root = _project_root(project_id)
    try:
        with pytest.raises(HTTPException) as exc:
            engineering_lab_engine.run_terminal(project_id, "not-allowed-tool --version", 1)

        assert exc.value.status_code == 400
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_overview_understands_go_projects() -> None:
    project_id = "lab-test-go"
    root = _project_root(project_id)
    try:
        (root / "go.mod").write_text(
            "module example.com/orders\n\ngo 1.23\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.10.0\n)\n",
            encoding="utf-8",
        )
        (root / "main.go").write_text(
            'package main\n\nfunc main() {\n\tr.GET("/orders", listOrders)\n\thttp.HandleFunc("/health", health)\n}\n',
            encoding="utf-8",
        )

        overview = engineering_lab_engine.overview(project_id)

        assert overview.primary_language == "go"
        assert overview.build == "configured"
        assert any(d.name == "github.com/gin-gonic/gin" and d.version == "v1.10.0" for d in overview.dependencies)
        routes = {(e.method, e.path) for e in overview.api_endpoints}
        assert ("GET", "/orders") in routes
        assert ("GET", "/health") in routes
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_overview_understands_php_csharp_and_rails() -> None:
    project_id = "lab-test-poly"
    root = _project_root(project_id)
    try:
        (root / "composer.json").write_text(
            '{"require": {"laravel/framework": "^11.0"}}', encoding="utf-8"
        )
        (root / "routes").mkdir()
        (root / "routes" / "api.php").write_text(
            "<?php\nRoute::get('/pedidos', [PedidoController::class, 'index']);\n", encoding="utf-8"
        )
        (root / "Api.csproj").write_text(
            '<Project><ItemGroup><PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" /></ItemGroup></Project>',
            encoding="utf-8",
        )
        (root / "Program.cs").write_text('app.MapGet("/status", () => "ok");\n', encoding="utf-8")
        (root / "config").mkdir()
        (root / "config" / "routes.rb").write_text("Rails.application.routes.draw do\n  get '/livros', to: 'livros#index'\nend\n", encoding="utf-8")

        overview = engineering_lab_engine.overview(project_id)

        deps = {(d.name, d.source) for d in overview.dependencies}
        assert ("laravel/framework", "composer.json:require") in deps
        assert ("Microsoft.EntityFrameworkCore", "Api.csproj") in deps
        routes = {(e.method, e.path) for e in overview.api_endpoints}
        assert ("GET", "/pedidos") in routes
        assert ("GET", "/status") in routes
        assert ("GET", "/livros") in routes
        assert overview.build == "configured"  # composer.json/csproj count as build manifests
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_terminal_rejects_inline_eval_but_allows_module_flags() -> None:
    project_id = "lab-test-eval"
    root = _project_root(project_id)
    try:
        for command in ["python -c print(1)", "node -e 1+1", "php -r echo(1);", "ruby -e puts(1)"]:
            with pytest.raises(HTTPException) as exc:
                engineering_lab_engine.run_terminal(project_id, command, 5)
            assert exc.value.status_code == 400

        # Interpreter flags after the module boundary belong to the tool, not the
        # runtime: `python -m json.tool --help` must run (exit 0).
        result = engineering_lab_engine.run_terminal(project_id, "python -m json.tool --help", 30)
        assert result.exit_code == 0
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_engineering_lab_terminal_decodes_non_ascii_output_as_utf8() -> None:
    """subprocess.run(text=True) with no explicit encoding decodes with
    locale.getpreferredencoding() -- cp1252 on this Windows environment, not
    UTF-8 -- silently mangling any non-ASCII stdout/stderr into mojibake.
    The child writes raw UTF-8 bytes directly to the stdout buffer (bypassing
    its own text layer's encoding) so this test isolates the parent's decode,
    which is exactly what was fixed."""
    project_id = "lab-test-encoding"
    root = _project_root(project_id)
    try:
        (root / "print_accented.py").write_text(
            "import sys\n"
            "sys.stdout.buffer.write('acentuacao real: áéíóú ção'.encode('utf-8'))\n",
            encoding="utf-8",
        )
        result = engineering_lab_engine.run_terminal(project_id, "python print_accented.py", 10)
        assert result.exit_code == 0
        stdout = "".join(chunk.text for chunk in result.output if chunk.kind == "stdout")
        assert "áéíóú ção" in stdout
        assert "�" not in stdout
    finally:
        shutil.rmtree(root, ignore_errors=True)


# --- route-level (HTTP) coverage -------------------------------------------- #
# The tests above exercise EngineeringLabEngine directly; nothing previously
# drove the actual /api/engineering-lab/* routes end-to-end, so the ownership
# check (_assert_owns_project), auth wiring, and audit event were unverified at
# the HTTP layer.

def test_engineering_lab_routes_overview_and_terminal_via_http(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    assert me.status_code == 200, me.text
    owner_id = me.json()["user_id"]

    result = ProjectWriter().write(
        [EmittedFile(path="package.json", content='{"name": "http-lab-test", "dependencies": {}}')],
        project_name="http-lab-test", owner=owner_id,
    )
    try:
        overview = client.get(f"/api/engineering-lab/projects/{result.project_id}/overview")
        assert overview.status_code == 200, overview.text
        assert overview.json()["project_id"] == result.project_id

        terminal = client.post(
            f"/api/engineering-lab/projects/{result.project_id}/terminal",
            json={"command": "python --version", "timeout_seconds": 30},
        )
        assert terminal.status_code == 200, terminal.text
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_engineering_lab_routes_are_owner_scoped(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="package.json", content='{"name": "owner-scoped-test", "dependencies": {}}')],
        project_name="owner-scoped-test", owner=owner_id,
    )
    try:
        other_token = _register_second_user(client)
        headers = {"Authorization": f"Bearer {other_token}"}
        overview = client.get(f"/api/engineering-lab/projects/{result.project_id}/overview", headers=headers)
        assert overview.status_code == 404
        terminal = client.post(
            f"/api/engineering-lab/projects/{result.project_id}/terminal",
            json={"command": "npm --version", "timeout_seconds": 5},
            headers=headers,
        )
        assert terminal.status_code == 404
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)
