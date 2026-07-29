from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.engines.functional_coverage_engine import FunctionalCoverageEngine
from app.engines.generation_job_engine import GenerationJobEngine
from app.schemas.functional_completeness import (
    BackendResourceCoverage,
    FrontendResourceCoverage,
    MobileResourceCoverage,
    ResourceCoverage,
)
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# Same real-files-on-disk pattern as test_functional_completeness_engine.py --
# no filesystem mocking.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "coverage-test") -> dict:
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files], project_name=name,
        )
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _evaluate(project: dict, resources: list[ResourceCoverage] | None = None):
    engine = FunctionalCoverageEngine()
    return engine.evaluate(project["project_id"], Path(project["generated_project_path"]), resources or [])


def _resource(
    name: str = "Produto", *, endpoints: list[str] | None = None,
    frontend: FrontendResourceCoverage | None = None, mobile: MobileResourceCoverage | None = None,
) -> ResourceCoverage:
    return ResourceCoverage(
        resource=name,
        backend=BackendResourceCoverage(controller=True, service=True, repository=True, endpoints=endpoints or ["GET", "POST"]),
        frontend=frontend, mobile=mobile,
    )


# --------------------------------------------------------------- button/handler

def test_button_with_no_handler_is_a_warning(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <button>Excluir</button>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "button_no_handler"]
    assert len(findings) == 1
    assert findings[0].confidence == "warning"


def test_button_with_empty_handler_is_a_confirmed_error(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <button onClick={() => {}}>Excluir</button>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "empty_handler"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"
    assert report.frontend.blocking is True


def test_button_with_console_log_only_handler_is_a_confirmed_error(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <button onClick={() => console.log('x')}>Excluir</button>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "empty_handler"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"


def test_button_with_a_real_handler_has_no_finding(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <button onClick={() => onDelete(id)}>Excluir</button>; }"),
    ])
    report = _evaluate(project)
    assert not any(f.category in {"button_no_handler", "empty_handler"} for f in report.frontend.findings)


def test_submit_button_with_no_onclick_is_not_flagged(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function Form() { return <button type=\"submit\">Salvar</button>; }"),
    ])
    report = _evaluate(project)
    assert not any(f.category == "button_no_handler" for f in report.frontend.findings)


# ------------------------------------------------------------------------ form

def test_form_with_no_submit_and_no_submit_button_is_high_confidence(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/new/page.tsx", "export default function New() { return <form><input name=\"nome\" /></form>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "form_no_submit"]
    assert len(findings) == 1
    assert findings[0].confidence == "high_confidence"


def test_form_with_a_submit_button_but_no_handler_is_a_warning(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        (
            "app/produtos/new/page.tsx",
            "export default function New() { return <form><input name=\"nome\" /><button type=\"submit\">Salvar</button></form>; }",
        ),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "form_no_submit"]
    assert len(findings) == 1
    assert findings[0].confidence == "warning"


def test_form_with_a_real_submit_handler_has_no_finding(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/new/page.tsx", "export default function New() { return <form onSubmit={handleSubmit}><input name=\"nome\" /></form>; }"),
    ])
    report = _evaluate(project)
    assert not any(f.category == "form_no_submit" for f in report.frontend.findings)


# ------------------------------------------------------------------ placeholder

def test_placeholder_phrase_on_a_short_page_is_a_confirmed_error(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/relatorios/page.tsx", "export default function Reports() { return (<div>Em breve</div>); }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "placeholder_page"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"


def test_short_page_without_placeholder_phrase_is_only_a_warning(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/relatorios/page.tsx", "export default function Reports() { return (<div>Relatorios</div>); }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "placeholder_page"]
    assert len(findings) == 1
    assert findings[0].confidence == "warning"


def test_a_substantial_page_is_never_flagged_as_placeholder(make_project):
    body = "".join(f"<p>Linha de conteudo real numero {i} com bastante texto para ultrapassar o limite.</p>" for i in range(10))
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/relatorios/page.tsx", f"export default function Reports() {{ return (<div>{body}</div>); }}"),
    ])
    report = _evaluate(project)
    assert not any(f.category == "placeholder_page" for f in report.frontend.findings)


# ---------------------------------------------------------------- broken nav

def test_navigation_to_a_nonexistent_static_route_is_a_confirmed_error(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <a onClick={() => router.push('/relatorios/mensal')}>Ver</a>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "broken_navigation"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"


def test_navigation_to_an_existing_route_has_no_finding(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { return <a onClick={() => router.push('/relatorios')}>Ver</a>; }"),
        ("app/relatorios/page.tsx", "export default function Reports() { return <div>Relatorios reais com bastante conteudo.</div>; }"),
    ])
    report = _evaluate(project)
    assert not any(f.category == "broken_navigation" for f in report.frontend.findings)


# ----------------------------------------------------------- state coverage

def test_api_call_with_no_state_handling_is_high_confidence(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "export default function List() { const data = apiClient.get('/produtos'); return <div>{data}</div>; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "missing_state_coverage"]
    assert len(findings) == 1
    assert findings[0].confidence == "high_confidence"


def test_api_call_with_full_state_handling_has_no_finding(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        (
            "app/produtos/page.tsx",
            "export default function List() {\n"
            "  const { data, isLoading, isError } = useQuery('produtos');\n"
            "  if (isLoading) return <Spinner />;\n"
            "  if (isError) return <ErrorMessage />;\n"
            "  if (!data.length) return <div>Nenhum produto encontrado</div>;\n"
            "  return <div>{data}</div>;\n"
            "}\n",
        ),
    ])
    report = _evaluate(project)
    assert not any(f.category == "missing_state_coverage" for f in report.frontend.findings)


# --------------------------------------------------------------- resource wiring

def test_resource_with_frontend_pages_but_no_api_client_is_a_confirmed_error(make_project):
    project = make_project([("package.json", "{\"name\": \"web\"}"), ("app/produtos/page.tsx", "export default function List() { return <div />; }")])
    resources = [_resource(frontend=FrontendResourceCoverage(listPage=True, apiClient=False))]
    report = _evaluate(project, resources)
    findings = [f for f in report.frontend.findings if f.category == "screen_no_api_call"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"


def test_resource_with_no_frontend_pages_at_all_is_endpoint_no_screen(make_project):
    project = make_project([("package.json", "{\"name\": \"web\"}")])
    resources = [_resource(frontend=FrontendResourceCoverage())]
    report = _evaluate(project, resources)
    findings = [f for f in report.frontend.findings if f.category == "endpoint_no_screen"]
    assert len(findings) == 1
    assert findings[0].confidence == "confirmed_error"


def test_resource_missing_only_one_frontend_page_is_incomplete_crud_high_confidence(make_project):
    project = make_project([("package.json", "{\"name\": \"web\"}")])
    resources = [_resource(frontend=FrontendResourceCoverage(
        listPage=True, createPage=True, editPage=True, detailPage=True, deletePage=False, apiClient=True,
    ))]
    report = _evaluate(project, resources)
    findings = [f for f in report.frontend.findings if f.category == "incomplete_crud"]
    assert len(findings) == 1
    assert findings[0].confidence == "high_confidence"


def test_fully_covered_resource_has_no_wiring_findings(make_project):
    project = make_project([("package.json", "{\"name\": \"web\"}")])
    resources = [_resource(frontend=FrontendResourceCoverage(
        listPage=True, createPage=True, editPage=True, detailPage=True, deletePage=True, apiClient=True,
    ))]
    report = _evaluate(project, resources)
    assert not any(f.category in {"screen_no_api_call", "endpoint_no_screen", "incomplete_crud"} for f in report.frontend.findings)


def test_mobile_resource_wiring_uses_mobile_slots(make_project):
    project = make_project([("apps/mobile/app.json", "{}")])
    resources = [_resource(mobile=MobileResourceCoverage(listScreen=True, detailScreen=False, deleteScreen=False, apiClient=True))]
    report = _evaluate(project, resources)
    assert report.mobile is not None
    findings = [f for f in report.mobile.findings if f.category == "incomplete_crud"]
    assert len(findings) == 1


# ------------------------------------------------------------ unresolved reference

def test_import_pointing_to_a_nonexistent_file_is_high_confidence(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "import { useProdutos } from './hooks/useProdutos';\nexport default function List() { return <div />; }"),
    ])
    report = _evaluate(project)
    findings = [f for f in report.frontend.findings if f.category == "unresolved_reference"]
    assert len(findings) == 1
    assert findings[0].confidence == "high_confidence"


def test_import_pointing_to_a_real_file_has_no_finding(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("app/produtos/page.tsx", "import { useProdutos } from './hooks/useProdutos';\nexport default function List() { return <div />; }"),
        ("app/produtos/hooks/useProdutos.ts", "export function useProdutos() { return []; }"),
    ])
    report = _evaluate(project)
    assert not any(f.category == "unresolved_reference" for f in report.frontend.findings)


# ----------------------------------------------------------------------- misc

def test_no_frontend_or_mobile_root_yields_none_sections(make_project):
    project = make_project([("README.md", "# App\n")])
    report = _evaluate(project)
    assert report.frontend is None
    assert report.mobile is None


def test_clean_project_scores_100_and_is_not_blocking(make_project):
    project = make_project([
        ("package.json", "{\"name\": \"web\"}"),
        ("README.md", "# App\n"),
    ])
    report = _evaluate(project)
    assert report.frontend.score == 100
    assert report.frontend.blocking is False


def test_functional_coverage_is_written_to_disk_alongside_other_reports(make_project):
    files = [("package.json", "{\"name\": \"web\"}"), ("app/produtos/page.tsx", "export default function List() { return <div />; }")]
    project = make_project(files, name="wiring-test")
    job_engine = GenerationJobEngine()
    job = {
        "id": "job-coverage-wiring", "generatedProjectId": project["project_id"],
        "resultPath": project["generated_project_path"], "logs": [],
    }
    job_engine._evaluate_functional_completeness(job, "owner-1", build_skipped=False)

    coverage_path = Path(project["generated_project_path"]) / "functional-coverage.json"
    assert coverage_path.is_file()
    import json
    data = json.loads(coverage_path.read_text(encoding="utf-8"))
    assert data["project_id"] == project["project_id"]
    assert "frontend" in data
