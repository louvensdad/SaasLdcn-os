from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.engines.frontend_authenticity_gate import frontend_authenticity_gate


@pytest.fixture
def project_root():
    # Self-managed temp dir (Windows pytest tmp_path PermissionError gotcha).
    root = Path(tempfile.mkdtemp(prefix="ldcn-authenticity-"))
    (root / "apps" / "web").mkdir(parents=True)
    (root / "apps" / "web" / "package.json").write_text('{"name": "web"}', encoding="utf-8")
    try:
        yield root
    finally:
        shutil.rmtree(root, ignore_errors=True)


def _write_page(root: Path, rel_path: str, content: str) -> None:
    path = root / "apps" / "web" / rel_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


class TestCleanProjectPasses:
    def test_no_findings_for_real_looking_content(self, project_root):
        _write_page(
            project_root, "app/orders/page.tsx",
            'export default function OrdersPage() {\n'
            '  const { data, isLoading, isError } = useQuery("orders", fetchOrders);\n'
            '  if (isLoading) return <Skeleton />;\n'
            '  if (isError) return <ErrorMessage />;\n'
            '  if (!data?.length) return <EmptyState message="Nenhum pedido encontrado" />;\n'
            '  return <OrderList orders={data} />;\n'
            '}\n',
        )
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert report.findings == []
        assert report.score == 100
        assert report.blocking is False


class TestLoremIpsum:
    def test_lorem_ipsum_is_confirmed_error(self, project_root):
        _write_page(project_root, "app/about/page.tsx", 'export default function About() {\n  return <p>Lorem ipsum dolor sit amet.</p>;\n}\n')
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert any(f.category == "lorem_ipsum" and f.confidence == "confirmed_error" for f in report.findings)
        assert report.blocking is True
        assert report.score < 100


class TestGenericCopy:
    def test_generic_marketing_phrase_is_confirmed_error(self, project_root):
        _write_page(project_root, "app/page.tsx", 'export default function Home() {\n  return <h1>Welcome to Our Platform</h1>;\n}\n')
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert any(f.category == "generic_copy" and f.confidence == "confirmed_error" for f in report.findings)

    def test_placeholder_attribute_is_not_flagged(self, project_root):
        # A real, ordinary UX placeholder attribute must never be mistaken
        # for generic body copy.
        _write_page(
            project_root, "app/login/page.tsx",
            'export default function Login() {\n'
            '  return <input placeholder="Insert your text here" />;\n'
            '}\n',
        )
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert report.findings == []

    def test_hello_world_is_only_a_warning(self, project_root):
        _write_page(project_root, "app/page.tsx", 'export default function Home() {\n  return <h1>Hello World</h1>;\n}\n')
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        finding = next(f for f in report.findings if f.category == "generic_copy")
        assert finding.confidence == "warning"
        assert report.blocking is False


class TestGenericImages:
    def test_placeholder_image_service_is_high_confidence(self, project_root):
        _write_page(project_root, "app/page.tsx", 'export default function Home() {\n  return <img src="https://picsum.photos/200" />;\n}\n')
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert any(f.category == "generic_placeholder_image" and f.confidence == "high_confidence" for f in report.findings)
        assert report.blocking is False  # high_confidence alone doesn't block


class TestMockDataInProduction:
    def test_mock_data_in_a_real_page_is_flagged(self, project_root):
        _write_page(
            project_root, "app/users/page.tsx",
            'const mockData = [{ id: 1, name: "Test User" }];\n'
            'export default function Users() {\n  return <UserList users={mockData} />;\n}\n',
        )
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert any(f.category == "mock_data_outside_mock_layer" for f in report.findings)

    def test_mock_data_inside_mock_repository_layer_is_not_flagged(self, project_root):
        _write_page(
            project_root, "lib/repositories/mock-user-repository.ts",
            'const mockData = [{ id: 1, name: "Test User" }];\nexport const MockUserRepository = { list: () => mockData };\n',
        )
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert report.findings == []

    def test_msw_handlers_are_not_flagged(self, project_root):
        _write_page(
            project_root, "mocks/handlers.ts",
            'const mockData = [{ id: 1, name: "Test User" }];\nexport const handlers = [];\n',
        )
        report = frontend_authenticity_gate.evaluate("proj-1", project_root)
        assert report.findings == []


class TestNoFrontendRoot:
    def test_backend_only_project_returns_empty_report(self):
        root = Path(tempfile.mkdtemp(prefix="ldcn-authenticity-backend-only-"))
        try:
            (root / "requirements.txt").write_text("fastapi\n", encoding="utf-8")
            report = frontend_authenticity_gate.evaluate("proj-1", root)
            assert report.findings == []
            assert report.score == 100
        finally:
            shutil.rmtree(root, ignore_errors=True)
