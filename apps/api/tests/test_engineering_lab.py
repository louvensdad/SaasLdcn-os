from __future__ import annotations

import shutil
from pathlib import Path

import pytest
from fastapi import HTTPException

from app.engines.engineering_lab_engine import engineering_lab_engine
from app.services.project_writer import DEFAULT_OUTPUT_ROOT


def _project_root(project_id: str) -> Path:
    root = DEFAULT_OUTPUT_ROOT / project_id
    shutil.rmtree(root, ignore_errors=True)
    root.mkdir(parents=True)
    return root


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
