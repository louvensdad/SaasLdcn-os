from __future__ import annotations

import json
import shutil
from pathlib import Path

import pytest

from app.engines.documentation_engine import DocumentationEngine
from app.engines.functional_completeness_engine import FunctionalCompletenessEngine
from app.engines.generation_job_engine import GenerationJobEngine
from app.routes import meta_factory
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter
from fastapi import HTTPException

# Projects must live inside the workspace root (the engine enforces it, same as
# QualityGateEngine), so we create them under the real DEFAULT_OUTPUT_ROOT and
# clean up afterwards -- same pattern as test_quality_gate_auto_repair.py.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "completeness-test") -> dict:
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files], project_name=name,
        )
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _controller(package: str, resource: str) -> str:
    return f"""package {package};

import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/{resource.lower()}s")
public class {resource}Controller {{
    @GetMapping
    public void list() {{}}
    @PostMapping
    public void create() {{}}
    @PutMapping("/{{id}}")
    public void update() {{}}
    @DeleteMapping("/{{id}}")
    public void remove() {{}}
}}
"""


def _service(package: str, resource: str) -> str:
    return f"""package {package};

import org.springframework.stereotype.Service;

@Service
public class {resource}Service {{}}
"""


def _repository(package: str, resource: str) -> str:
    return f"""package {package};

import org.springframework.stereotype.Repository;

@Repository
public class {resource}Repository {{}}
"""


def _nest_controller(resource: str) -> str:
    return f"""import {{ Controller, Get, Post, Put, Delete, Body, Param }} from '@nestjs/common';
import {{ {resource}Service }} from './{resource.lower()}.service';

@Controller('{resource.lower()}s')
export class {resource}Controller {{
  constructor(private readonly service: {resource}Service) {{}}
  @Get() list() {{}}
  @Post() create(@Body() body: unknown) {{}}
  @Put(':id') update(@Param('id') id: string) {{}}
  @Delete(':id') remove(@Param('id') id: string) {{}}
}}
"""


def _nest_service(resource: str) -> str:
    return f"""import {{ Injectable }} from '@nestjs/common';

@Injectable()
export class {resource}Service {{}}
"""


def _spring_app(package: str) -> str:
    return f"""package {package};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {{
    public static void main(String[] args) {{ SpringApplication.run(Application.class, args); }}
}}
"""


def _full_frontend_pages(resource: str) -> list[tuple[str, str]]:
    slug = resource.lower()
    return [
        (f"app/{slug}/page.tsx", f"import {{ apiClient }} from '@/lib/api-client';\nasync function onDelete(id: string) {{ await apiClient.delete(`/{slug}/${{id}}`); }}\nexport default function List() {{ return <div>{slug} list isLoading error empty</div>; }}"),
        (f"app/{slug}/new/page.tsx", f"import {{ apiClient }} from '@/lib/api-client';\nexport default function Create() {{ return <form>{slug}</form>; }}"),
        (f"app/{slug}/[id]/edit/page.tsx", f"import {{ apiClient }} from '@/lib/api-client';\nexport default function Edit() {{ return <form>{slug}</form>; }}"),
        (f"app/{slug}/[id]/page.tsx", f"import {{ apiClient }} from '@/lib/api-client';\nexport default function Detail() {{ return <div>{slug}</div>; }}"),
        ("src/lib/api-client.ts", f"export const apiClient = {{ {slug}: () => fetch('/api/{slug}') }};"),
        ("src/components/nav.tsx", f"export function Nav() {{ return <a href='/{slug}'>{slug}</a>; }}"),
    ]


def _good_java_project_files(resource: str = "Produto") -> list[tuple[str, str]]:
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/{resource}Controller.java", _controller(package, resource)),
        (f"{java_dir}/{resource}Service.java", _service(package, resource)),
        (f"{java_dir}/{resource}Repository.java", _repository(package, resource)),
        ("pom.xml", "<project></project>"),
        ("package.json", "{\"name\": \"frontend\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    files.extend(_full_frontend_pages(resource))
    return files


def test_java_reserved_word_package_is_blocked(make_project):
    files = _good_java_project_files()
    files.append((
        "src/main/java/com/acme/app/interface/Broken.java",
        "package com.acme.app.interface;\n\npublic class Broken {}\n",
    ))
    project = make_project(files, name="java-reserved-word")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any(i.category == "java_safety" and "reserved word" in i.title.lower() for i in report.issues)


def test_duplicate_backend_trees_is_blocked(make_project):
    files = _good_java_project_files()
    files.extend([
        ("backend-v2/pom.xml", "<project></project>"),
        ("backend-v2/src/main/java/com/acme/other/Application.java", _spring_app("com.acme.other")),
    ])
    project = make_project(files, name="java-duplicate-tree")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any("duplicate" in i.id or "concurrent" in i.title.lower() for i in report.issues)


def test_leaked_protocol_marker_is_blocked(make_project):
    files = _good_java_project_files()
    files.append((
        "src/main/java/com/acme/app/Broken.java",
        "<<<FILE path=\"x.java\">>>\npackage com.acme.app;\npublic class Broken {}\n<<<END>>>\n",
    ))
    project = make_project(files, name="java-paste-marker")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any(i.category == "content_integrity" for i in report.issues)


def test_readme_docker_compose_mismatch_is_blocked(make_project):
    files = _good_java_project_files()
    files = [(p, c) for p, c in files if p != "README.md"]
    files.append(("README.md", "# App\nStart the database with `docker-compose up -d postgres`.\n" * 3))
    project = make_project(files, name="readme-docker-mismatch")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any(i.category == "documentation" for i in report.issues)


def test_dashboard_only_frontend_never_verified(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        ("pom.xml", "<project></project>"),
        ("package.json", "{\"name\": \"frontend\"}"),
        ("README.md", "# App\n" * 10),
        ("app/dashboard/page.tsx", "export default function Dashboard() { return <div>Dashboard</div>; }"),
    ]
    for resource in ("Produto", "Pedido", "Cliente"):
        files.append((f"{java_dir}/{resource}Controller.java", _controller(package, resource)))
        files.append((f"{java_dir}/{resource}Service.java", _service(package, resource)))
        files.append((f"{java_dir}/{resource}Repository.java", _repository(package, resource)))
    project = make_project(files, name="dashboard-only")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status != "VERIFIED"
    assert report.status == "BLOCKED"
    assert any(i.id == "frontend_incomplete_dashboard_only" for i in report.issues)
    # Endpoint-without-page: every resource's frontend coverage is all-false.
    for resource in report.resources:
        assert resource.frontend is not None
        assert not any([
            resource.frontend.listPage, resource.frontend.createPage,
            resource.frontend.editPage, resource.frontend.detailPage,
            resource.frontend.deletePage,
        ])


def test_delete_button_calling_the_delete_method_is_detected_as_delete_coverage(make_project):
    # Delete is almost never its own route -- it's a button on the list/detail
    # page. This is the realistic case: no dedicated /delete route, just a
    # confirm-and-call inline in the list page.
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("package.json", "{\"name\": \"frontend\"}"),
        ("README.md", "# App\n" * 10),
        (
            "app/produtos/page.tsx",
            "export default function ProdutosList() {\n"
            "  async function onDelete(id: string) { await api.delete(`/produtos/${id}`); }\n"
            "  return <div>Produtos</div>;\n"
            "}\n",
        ),
    ]
    project = make_project(files, name="produto-inline-remove-button")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.frontend is not None
    assert produto.frontend.deletePage is True
    assert produto.frontend.listPage is True


def test_dedicated_delete_route_is_also_detected_as_delete_coverage(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("package.json", "{\"name\": \"frontend\"}"),
        ("README.md", "# App\n" * 10),
        ("app/produtos/[id]/delete/page.tsx", "export default function ConfirmDelete() { return <div />; }"),
    ]
    project = make_project(files, name="produto-confirm-remove-route")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.frontend is not None
    assert produto.frontend.deletePage is True


def test_resource_with_no_delete_signal_is_not_credited_with_delete_coverage(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("package.json", "{\"name\": \"frontend\"}"),
        ("README.md", "# App\n" * 10),
        ("app/produtos/page.tsx", "export default function ProdutosList() { return <div>Produtos</div>; }"),
        ("app/produtos/new/page.tsx", "export default function NewProduto() { return <div />; }"),
    ]
    project = make_project(files, name="produto-no-removal-action")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.frontend is not None
    assert produto.frontend.deletePage is False
    assert produto.frontend.listPage is True and produto.frontend.createPage is True


def test_mobile_login_only_without_token_storage_never_verified(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
        ("apps/mobile/src/screens/LoginScreen.tsx", "export default function LoginScreen() { return null; }"),
    ]
    project = make_project(files, name="mobile-login-only")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status != "VERIFIED"
    assert any(i.id == "mobile_login_no_token_storage" for i in report.issues)
    assert any(i.id == "mobile_login_only" for i in report.issues)


def test_mobile_delete_button_calling_the_delete_method_is_detected_as_delete_coverage(make_project):
    # Same reasoning as the frontend's deletePage: delete is almost never its
    # own screen -- it's a button on the list/detail screen. This is the
    # realistic case: no dedicated delete screen, just a confirm-and-call
    # inline in the list screen.
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
        (
            "apps/mobile/src/screens/ProdutoListScreen.tsx",
            "export default function ProdutoListScreen() {\n"
            "  async function onRemove(id: string) { await api.delete(`/produtos/${id}`); }\n"
            "  return null;\n"
            "}\n",
        ),
    ]
    project = make_project(files, name="produto-mobile-inline-remove-button")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.mobile is not None
    assert produto.mobile.deleteScreen is True
    assert produto.mobile.listScreen is True


def test_mobile_dedicated_delete_screen_is_also_detected_as_delete_coverage(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
        ("apps/mobile/src/screens/ProdutoDeleteScreen.tsx", "export default function ConfirmDelete() { return null; }"),
    ]
    project = make_project(files, name="produto-mobile-confirm-remove-screen")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.mobile is not None
    assert produto.mobile.deleteScreen is True


def test_mobile_resource_with_no_delete_signal_is_not_credited_with_delete_coverage(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
        ("apps/mobile/src/screens/ProdutoListScreen.tsx", "export default function ProdutoListScreen() { return null; }"),
        ("apps/mobile/src/screens/ProdutoDetailScreen.tsx", "export default function ProdutoDetailScreen() { return null; }"),
    ]
    project = make_project(files, name="produto-mobile-no-removal-action")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    produto = next(r for r in report.resources if r.resource.lower() == "produto")
    assert produto.mobile is not None
    assert produto.mobile.deleteScreen is False
    assert produto.mobile.listScreen is True and produto.mobile.detailScreen is True


def test_mobile_login_with_token_storage_is_recognized(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
        (
            "apps/mobile/src/screens/LoginScreen.tsx",
            "import * as SecureStore from 'expo-secure-store';\n"
            "async function login() { await SecureStore.setItemAsync('token', 'x'); }\n"
            "export default function LoginScreen() { return null; }",
        ),
        (
            "apps/mobile/src/context/AuthContext.tsx",
            "export function AuthProvider() { return null; }",
        ),
        ("apps/mobile/src/screens/ProdutoListScreen.tsx", "export default function ProdutoListScreen() { return null; }"),
        ("apps/mobile/src/api/client.ts", "export const apiClient = { produto: () => fetch('/api/produtos') };"),
    ]
    project = make_project(files, name="mobile-login-real")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert not any(i.id == "mobile_login_no_token_storage" for i in report.issues)
    assert not any(i.id == "mobile_login_only" for i in report.issues)


def test_build_skipped_caps_at_partially_verified(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="build-skipped")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project, build_skipped=True)
    assert report.status == "PARTIALLY_VERIFIED"
    assert report.build_skipped is True


def test_fully_covered_project_is_verified(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="fully-covered")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project, build_skipped=False)
    assert report.status == "VERIFIED"
    assert report.issues == [] or all(i.severity != "BLOCKER" for i in report.issues)
    assert report.resources[0].coverage == 100


def test_completeness_artifacts_written_to_disk(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="artifacts-test")
    job_engine = GenerationJobEngine()
    job = {
        "id": "job-artifacts-test",
        "generatedProjectId": project["project_id"],
        "resultPath": project["generated_project_path"],
        "logs": [],
    }
    job_engine._evaluate_functional_completeness(job, "owner-1", build_skipped=False)

    root = Path(project["generated_project_path"])
    report_path = root / "product-completion-report.json"
    coverage_path = root / "endpoint-ui-coverage.json"
    depth_path = root / "ui-depth-score.json"
    assert report_path.is_file()
    assert coverage_path.is_file()
    assert depth_path.is_file()

    import json
    coverage = json.loads(coverage_path.read_text(encoding="utf-8"))
    assert isinstance(coverage, list) and coverage
    assert {"resource", "backend", "frontend", "mobile", "coverage"} <= set(coverage[0].keys())

    assert job["completenessStatus"] == "VERIFIED"
    assert job["completenessSummary"]["status"] == "VERIFIED"


def test_require_verified_blocks_export_when_not_verified(make_project, monkeypatch):
    files = _good_java_project_files()
    project = make_project(files, name="require-verified-block")
    ProjectWriter().set_functional_completeness(project["project_id"], report={
        "status": "BLOCKED",
        "missing_features": ["Java package uses a reserved word"],
        "issues": [{"severity": "BLOCKER", "title": "Java package uses a reserved word", "file": "Broken.java"}],
    })

    class _FakeQualityReport:
        release_override = False
        blocker_count = 0

    monkeypatch.setattr(meta_factory.quality_gate_engine, "evaluate", lambda *a, **k: _FakeQualityReport())

    with pytest.raises(HTTPException) as exc_info:
        meta_factory._require_verified(project["project_id"], force=False)
    assert exc_info.value.status_code == 409
    assert exc_info.value.detail["code"] == "FUNCTIONAL_COMPLETENESS_NOT_VERIFIED"

    # The existing force-release escape hatch is unaffected.
    meta_factory._require_verified(project["project_id"], force=True)


def test_require_verified_allows_export_when_verified(make_project, monkeypatch):
    files = _good_java_project_files()
    project = make_project(files, name="require-verified-pass")
    ProjectWriter().set_functional_completeness(project["project_id"], report={
        "status": "VERIFIED", "missing_features": [], "issues": [],
    })
    ProjectWriter().set_verification(project["project_id"], verified=True, score=100)

    class _FakeQualityReport:
        release_override = False
        blocker_count = 0

    monkeypatch.setattr(meta_factory.quality_gate_engine, "evaluate", lambda *a, **k: _FakeQualityReport())

    meta_factory._require_verified(project["project_id"], force=False)


def test_nestjs_controller_and_service_are_discovered_without_false_repository_warning(make_project):
    files = [
        ("src/projeto/projeto.controller.ts", _nest_controller("Projeto")),
        ("src/projeto/projeto.service.ts", _nest_service("Projeto")),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="nestjs-discovery")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    resource = next(r for r in report.resources if r.resource == "Projeto")
    assert resource.backend.controller is True
    assert resource.backend.service is True
    assert set(resource.backend.endpoints) == {"GET", "POST", "PUT", "DELETE"}
    # Prisma/TypeORM-in-service is idiomatic NestJS -- must not get the
    # Java-shaped "no matching Repository" warning.
    assert not any(i.id == "backend_no_repository_Projeto" for i in report.issues)


def test_nestjs_duplicate_controller_locations_is_blocked(make_project):
    files = [
        ("src/modules/projeto/projeto.controller.ts", _nest_controller("Projeto")),
        ("src/modules/projeto/projeto.service.ts", _nest_service("Projeto")),
        ("src/application/projeto/projeto.controller.ts", _nest_controller("Projeto")),
        ("src/application/projeto/projeto.service.ts", _nest_service("Projeto")),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="nestjs-duplicate-tree")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    dup = next(i for i in report.issues if i.id == "duplicate_resource_implementation_Projeto")
    assert dup.detail.count("projeto.controller.ts") == 2
    assert "modules" in dup.detail and "application" in dup.detail


def test_java_projects_are_unaffected_by_the_controllers_list_refactor(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="java-still-works")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    resource = next(r for r in report.resources if r.resource == "Produto")
    assert resource.backend.controller is True
    assert resource.backend.service is True
    assert resource.backend.repository is True
    assert not any(i.id.startswith("duplicate_resource_implementation") for i in report.issues)


def test_ts_project_with_no_nestjs_controllers_falls_back_to_needs_human_review(make_project):
    files = [
        ("src/index.ts", "console.log('plain express app, not nestjs');\n"),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="ts-unsupported-shape")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "NEEDS_HUMAN_REVIEW"
    assert report.resources == []


def _next_route(*methods: str) -> str:
    handlers = "\n".join(
        f"export async function {m}(request) {{ return Response.json({{}}); }}" for m in methods
    )
    return f"import {{ NextRequest, NextResponse }} from 'next/server';\n\n{handlers}\n"


def test_nextjs_api_routes_merge_into_one_resource_without_duplicate_blocker(make_project):
    files = [
        ("src/app/api/produtos/route.ts", _next_route("GET", "POST")),
        ("src/app/api/produtos/[id]/route.ts", _next_route("GET", "PUT", "DELETE")),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="nextjs-api-routes")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    resource = next(r for r in report.resources if r.resource == "Produtos")
    assert set(resource.backend.endpoints) == {"GET", "POST", "PUT", "DELETE"}
    assert not any(i.id.startswith("duplicate_resource_implementation") for i in report.issues)


def _fastapi_router(prefix: str, *methods: str) -> str:
    handlers = "\n".join(f"@router.{m.lower()}('/')\ndef handler_{m.lower()}(): ..." for m in methods)
    return f"from fastapi import APIRouter\n\nrouter = APIRouter(prefix='/{prefix}')\n\n{handlers}\n"


def test_fastapi_duplicate_router_prefix_is_blocked(make_project):
    files = [
        ("app/controllers/ativo_controller.py", _fastapi_router("ativos", "GET", "POST")),
        ("app/routers/ativos_v2.py", _fastapi_router("ativos", "GET")),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="fastapi-duplicate")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any(i.id == "duplicate_resource_implementation_Ativos" for i in report.issues)


def test_fastapi_single_router_is_discovered_without_false_repository_warning(make_project):
    files = [
        ("app/controllers/ativo_controller.py", _fastapi_router("ativos", "GET", "POST")),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="fastapi-single")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    resource = next(r for r in report.resources if r.resource == "Ativos")
    assert set(resource.backend.endpoints) == {"GET", "POST"}
    assert not any(i.id == "backend_no_repository_Ativos" for i in report.issues)


def test_fastapi_router_inside_a_virtualenv_is_never_discovered(make_project):
    files = [
        (".ldcn-venv/Lib/site-packages/fastapi/routing.py", _fastapi_router("internal", "GET")),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="fastapi-venv-guard")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "NEEDS_HUMAN_REVIEW"
    assert report.resources == []


# --------------------------- Phase 8: OpenAPI <-> frontend contract drift ----

_VALID_OPENAPI_WORKSPACE = """
openapi: 3.0.0
info:
  title: Test API
  version: "1.0"
paths: {}
components:
  schemas:
    Workspace:
      type: object
      properties:
        id:
          type: string
        nome:
          type: string
        descricao:
          type: string
"""

_INVALID_OPENAPI_UNQUOTED_COLON = """
openapi: 3.0.0
info:
  title: Test API
  version: "1.0"
paths: {}
components:
  schemas:
    Coluna:
      type: object
      properties:
        nome:
          type: string
          description: Nome da coluna (ex: "A Fazer")
"""


def test_invalid_openapi_yaml_is_blocked(make_project):
    files = [
        ("openapi.yaml", _INVALID_OPENAPI_UNQUOTED_COLON),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="openapi-invalid-yaml")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.status == "BLOCKED"
    assert any(i.id.startswith("openapi_spec_invalid_") for i in report.issues)


def test_frontend_type_with_zero_field_overlap_is_flagged_as_contract_drift(make_project):
    files = [
        ("openapi.yaml", _VALID_OPENAPI_WORKSPACE),
        ("src/lib/types.ts", "export interface Workspace {\n  papel: string;\n  ativo: boolean;\n}\n"),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="openapi-drift")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    issue = next(i for i in report.issues if i.id == "contract_drift_Workspace")
    assert "nome" in issue.detail
    assert "papel" in issue.detail


def test_frontend_type_matching_openapi_schema_has_no_drift_issue(make_project):
    files = [
        ("openapi.yaml", _VALID_OPENAPI_WORKSPACE),
        ("src/lib/types.ts", "export interface Workspace {\n  id: string;\n  nome: string;\n  descricao?: string;\n}\n"),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="openapi-no-drift")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert not any(i.id == "contract_drift_Workspace" for i in report.issues)


def test_contract_drift_ignores_stale_types_in_apps_mobile(make_project):
    # Confirmed live (2026-07-10): InvestTrack has a real, correct web frontend
    # type PLUS an entirely separate apps/mobile/ (Expo) tree with its own
    # stale English-named type of the same schema name -- the drift check was
    # scanning both combined, so a fully-correct web type still got flagged as
    # drifted because rglob("*.ts") picked up apps/mobile/ too.
    files = [
        ("openapi.yaml", _VALID_OPENAPI_WORKSPACE),
        ("src/lib/types.ts", "export interface Workspace {\n  id: string;\n  nome: string;\n  descricao?: string;\n}\n"),
        ("apps/mobile/src/types/api.ts", "export interface Workspace {\n  id: string;\n  name: string;\n  description?: string;\n}\n"),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="openapi-no-drift-with-mobile")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert not any(i.id == "contract_drift_Workspace" for i in report.issues)


def test_duplicate_openapi_specs_with_different_content_are_flagged(make_project):
    files = [
        ("openapi.yaml", _VALID_OPENAPI_WORKSPACE),
        ("docs/openapi.yaml", _INVALID_OPENAPI_UNQUOTED_COLON.replace("Coluna", "OutraColuna")),
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="openapi-duplicate")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    # docs/openapi.yaml is invalid on its own terms too -- both surface, and the
    # divergence check only compares the ones that parsed.
    assert any(i.id.startswith("openapi_spec_invalid_") for i in report.issues)


def test_prisma_schema_without_migrations_is_flagged(make_project):
    files = [
        ("prisma/schema.prisma", "datasource db {\n  provider = \"postgresql\"\n}\n"),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="prisma-no-migrations")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert any(i.id == "prisma_migrations_missing" for i in report.issues)


def test_prisma_schema_with_a_migration_is_not_flagged(make_project):
    files = [
        ("prisma/schema.prisma", "datasource db {\n  provider = \"postgresql\"\n}\n"),
        ("prisma/migrations/20260101000000_init/migration.sql", "-- init\n"),
        ("package.json", "{\"name\": \"api\"}"),
        ("README.md", "# App\nRun with npm start.\n" * 5),
    ]
    project = make_project(files, name="prisma-with-migrations")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert not any(i.id == "prisma_migrations_missing" for i in report.issues)


# ---------- Engineering Policy gap #4: the remaining 6 report categories ----------

def test_security_completeness_is_100_for_a_clean_project(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="security-clean")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.security_completeness == 100


def test_security_completeness_drops_for_a_real_hardcoded_secret(make_project):
    files = _good_java_project_files()
    files.append((
        "src/main/java/com/acme/app/Secrets.java",
        "package com.acme.app;\npublic class Secrets {\n  String apiKey = \"sk_live_real_secret_value_12345\";\n}\n",
    ))
    project = make_project(files, name="security-secret-leak")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.security_completeness is not None and report.security_completeness < 100


def test_integrations_completeness_is_100_when_no_provider_is_declared(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="integrations-none-declared")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.integrations_completeness == 100


def test_integrations_completeness_drops_for_an_unapproved_provider_sdk(make_project):
    files = [(p, c) for p, c in _good_java_project_files() if p != "package.json"]
    files.append(("package.json", json.dumps({"name": "frontend", "dependencies": {"stripe": "^14.0.0"}})))
    project = make_project(files, name="integrations-not-opted-in")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.integrations_completeness is not None and report.integrations_completeness < 100


def test_documentation_completeness_matches_documentation_engine_score(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="docs-score-parity")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    expected = DocumentationEngine().analyze(project)["score"]
    assert report.documentation_completeness == expected


def test_build_completeness_reflects_the_build_skipped_flag(make_project):
    files = _good_java_project_files()
    project = make_project(files, name="build-completeness")
    engine = FunctionalCompletenessEngine()
    assert engine.evaluate(project, build_skipped=True).build_completeness == 0
    assert engine.evaluate(project, build_skipped=False).build_completeness == 100


def test_api_coverage_completeness_is_full_when_every_resource_has_a_ui_client(make_project):
    files = _good_java_project_files()  # _full_frontend_pages() gives every resource an apiClient
    project = make_project(files, name="api-coverage-full")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.api_coverage_completeness == 100


def test_api_coverage_completeness_is_zero_when_no_ui_consumes_the_api(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
    ]
    project = make_project(files, name="api-coverage-none")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.api_coverage_completeness == 0


def test_tests_completeness_detects_a_resource_test_file(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        (f"{java_dir}/ProdutoControllerTest.java", "package com.acme.app;\npublic class ProdutoControllerTest {}\n"),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
    ]
    project = make_project(files, name="produto-has-a-test-file")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.tests_completeness == 100


def test_tests_completeness_is_zero_with_no_test_files(make_project):
    package = "com.acme.app"
    java_dir = "src/main/java/com/acme/app"
    files = [
        (f"{java_dir}/Application.java", _spring_app(package)),
        (f"{java_dir}/ProdutoController.java", _controller(package, "Produto")),
        (f"{java_dir}/ProdutoService.java", _service(package, "Produto")),
        (f"{java_dir}/ProdutoRepository.java", _repository(package, "Produto")),
        ("pom.xml", "<project></project>"),
        ("README.md", "# App\n" * 10),
    ]
    project = make_project(files, name="produto-with-no-test-file")
    engine = FunctionalCompletenessEngine()
    report = engine.evaluate(project)
    assert report.tests_completeness == 0
