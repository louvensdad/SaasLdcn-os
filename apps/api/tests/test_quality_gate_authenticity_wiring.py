from __future__ import annotations

import shutil
from pathlib import Path

import pytest

from app.engines.llm_repair_engine import _repairable
from app.engines.quality_gate_engine import QualityGateEngine
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# Confirms PARTE 7/8's authenticity findings actually reach the EXISTING
# repair chain (QualityGate -> LlmRepairEngine._repairable()) rather than
# sitting in an isolated report nobody acts on -- no new orchestrator needed,
# this is the load-bearing wiring that makes the existing chain pick them up.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "authenticity-wiring-test") -> dict:
        result = writer.write([EmittedFile(path=p, content=c) for p, c in files], project_name=name)
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "project_name": name, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


class TestAuthenticityFeedsQualityGate:
    def test_lorem_ipsum_becomes_a_blocker_quality_issue(self, make_project):
        project = make_project([
            ("README.md", "# Test\n"),
            ("apps/web/package.json", '{"name": "web"}'),
            ("apps/web/app/about/page.tsx", "export default function About() { return <p>Lorem ipsum dolor sit amet.</p>; }"),
        ])
        report = QualityGateEngine().evaluate(project, run_build=False)
        authenticity_issues = [i for i in report.issues if i.category == "authenticity"]
        assert len(authenticity_issues) == 1
        assert authenticity_issues[0].severity == "BLOCKER"
        assert authenticity_issues[0].auto_fixable is False

    def test_authenticity_blocker_is_picked_up_by_llm_repair_dispatch(self, make_project):
        project = make_project([
            ("README.md", "# Test\n"),
            ("apps/web/package.json", '{"name": "web"}'),
            ("apps/web/app/page.tsx", "export default function Home() { return <h1>Welcome to Our Platform</h1>; }"),
        ])
        report = QualityGateEngine().evaluate(project, run_build=False)
        repairable = _repairable(report)
        assert any(i.category == "authenticity" for i in repairable)

    def test_clean_frontend_adds_no_authenticity_issues(self, make_project):
        project = make_project([
            ("README.md", "# Test\n"),
            ("apps/web/package.json", '{"name": "web"}'),
            ("apps/web/app/orders/page.tsx", 'export default function Orders() { return <div>{"Pedidos reais"}</div>; }'),
        ])
        report = QualityGateEngine().evaluate(project, run_build=False)
        assert not [i for i in report.issues if i.category == "authenticity"]
