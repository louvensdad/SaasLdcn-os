from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.database import Base, database_url_for, get_engine
import app.models  # noqa: F401
from app.repositories.change_request_repository import ChangeRequestRepository
from app.services.change_snapshot_service import ChangeSnapshotError, ChangeSnapshotService, MAX_SNAPSHOT_TOTAL_BYTES
from app.services.diff_service import build_file_diffs
from app.services.file_protocol import EmittedFile
from app.services.generated_project_service import GeneratedProjectService
from app.services.project_writer import ProjectWriter

API_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]], name: str = "cr-test") -> dict:
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files],
            project_name=name,
        )
        created.append(Path(result.root_path))
        return {
            "project_id": result.project_id,
            "project_name": name,
            "generated_project_path": result.root_path,
        }

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


@pytest.fixture
def cr_repo() -> ChangeRequestRepository:
    temp_dir = API_ROOT / "tests" / ".tmp"
    temp_dir.mkdir(parents=True, exist_ok=True)
    database_path = temp_dir / f"test_change_requests_{uuid4().hex}.db"
    Base.metadata.create_all(bind=get_engine(database_url_for(database_path)))
    repo = ChangeRequestRepository(database_path)
    yield repo
    get_engine(database_url_for(database_path)).dispose()
    if database_path.exists():
        database_path.unlink()


# --------------------------------------------------------------------- create


def test_create_starts_in_draft_with_defaults(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="mude a cor do botao")
    assert cr["status"] == "Draft"
    assert cr["project_id"] == "proj_1"
    assert cr["intent"] == "mude a cor do botao"
    assert cr["scope"] == []
    assert cr["classification"] is None
    assert cr["history"] == []
    assert cr["change_request_id"].startswith("cr_")


def test_create_redacts_secret_looking_intent(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="use api_key=sk-abcdef1234567890")
    assert "sk-abcdef1234567890" not in cr["intent"]
    assert "[REDACTED]" in cr["intent"]


# ----------------------------------------------------------------------- read


def test_list_for_owner_and_get_for_owner(cr_repo: ChangeRequestRepository) -> None:
    created = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    fetched = cr_repo.get_for_owner(created["change_request_id"], "user_a")
    assert fetched is not None
    assert fetched["change_request_id"] == created["change_request_id"]

    listed = cr_repo.list_for_owner("user_a")
    assert [item["change_request_id"] for item in listed] == [created["change_request_id"]]

    by_project = cr_repo.list_for_project("proj_1", "user_a")
    assert [item["change_request_id"] for item in by_project] == [created["change_request_id"]]


def test_owner_isolation(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    assert cr_repo.get_for_owner(cr["change_request_id"], "user_b") is None
    assert cr_repo.list_for_owner("user_b") == []
    assert cr_repo.list_for_project("proj_1", "user_b") == []
    assert cr_repo.update_status(cr["change_request_id"], "user_b", "Rejected") is None
    assert cr_repo.delete_for_owner(cr["change_request_id"], "user_b") is False
    # unaffected under the real owner
    assert cr_repo.get_for_owner(cr["change_request_id"], "user_a") is not None


# --------------------------------------------------------------------- mutate


def test_full_mutator_round_trip(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    crid = cr["change_request_id"]

    cr = cr_repo.set_classification(
        crid, "user_a", {"category": "visual_only", "reason": "cor", "blueprint_impact": "none"}
    )
    assert cr["status"] == "Analyzed"
    assert cr["classification"]["category"] == "visual_only"

    cr = cr_repo.set_scope_and_impact(
        crid,
        "user_a",
        ["frontend/Button.tsx"],
        {"affected_files": ["frontend/Button.tsx"], "requires_backend_change": False},
        base_version="deadbeef",
    )
    assert cr["status"] == "Planned"
    assert cr["scope"] == ["frontend/Button.tsx"]
    assert cr["base_version"] == "deadbeef"

    cr = cr_repo.set_approval(crid, "user_a", {"status": "approved", "approved_by": "user_a", "approved_at": "t"})
    assert cr["status"] == "Approved"
    assert cr["approval"]["status"] == "approved"

    cr = cr_repo.set_snapshot(crid, "user_a", {"frontend/Button.tsx": "old content"}, status="Applying")
    assert cr["status"] == "Applying"
    assert cr["snapshot"] == {"frontend/Button.tsx": "old content"}

    cr = cr_repo.set_diff(crid, "user_a", [{"path": "frontend/Button.tsx", "change_kind": "modified"}])
    assert cr["status"] == "Applying"
    assert cr["diff"][0]["path"] == "frontend/Button.tsx"

    cr = cr_repo.set_build_result(crid, "user_a", {"ok": True})
    assert cr["build_result"] == {"ok": True}

    cr = cr_repo.set_preview_result(crid, "user_a", {"supported": False, "reason": "unsupported stack"})
    assert cr["status"] == "Validating"
    assert cr["preview_result"]["supported"] is False

    cr = cr_repo.set_result(crid, "user_a", {"outcome": "accepted", "recorded_at": "t"}, status="Accepted")
    assert cr["status"] == "Accepted"
    assert cr["result"]["outcome"] == "accepted"


def test_snapshot_preserves_literal_content_no_redaction(cr_repo: ChangeRequestRepository) -> None:
    """snapshot_json/diff_json must round-trip byte-exact -- redacting them would
    corrupt real generated code (e.g. a genuine `password = ...` assignment)."""
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    literal = 'password = "changeme123456"\ntoken: abcdefghij123456'
    saved = cr_repo.set_snapshot(cr["change_request_id"], "user_a", {"app/auth.py": literal})
    assert saved["snapshot"]["app/auth.py"] == literal


def test_history_and_operation_log_append(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    crid = cr["change_request_id"]
    cr = cr_repo.append_history(crid, "user_a", {"id": "h1", "event": "created", "actor": "user_a", "source": "api", "created_at": "t"})
    assert len(cr["history"]) == 1
    cr = cr_repo.append_operation(crid, "user_a", {"id": "o1", "timestamp": "t", "status": "success", "message": "ok"})
    assert len(cr["operational_log"]) == 1
    cr = cr_repo.set_last_failure(crid, "user_a", {"status_current": "Draft", "status_expected": ["Analyzed"], "endpoint_called": "x", "http_status": 409, "backend_message": "m", "rejection_reason": "r", "correction": "c"})
    assert cr["last_failure"]["backend_message"] == "m"
    cr = cr_repo.set_last_failure(crid, "user_a", None)
    assert cr["last_failure"] is None


def test_delete_for_owner(cr_repo: ChangeRequestRepository) -> None:
    cr = cr_repo.create(owner_user_id="user_a", project_id="proj_1", intent="ajuste")
    assert cr_repo.delete_for_owner(cr["change_request_id"], "user_a") is True
    assert cr_repo.get_for_owner(cr["change_request_id"], "user_a") is None


# ============================================================ snapshot service


def test_snapshot_capture_existing_files(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "export const Button = () => <button />;")])
    snapshot = ChangeSnapshotService().capture(project, ["frontend/Button.tsx"])
    assert snapshot == {"frontend/Button.tsx": "export const Button = () => <button />;"}


def test_snapshot_capture_not_yet_existing_file_is_none(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    snapshot = ChangeSnapshotService().capture(project, ["frontend/NewFile.tsx"])
    assert snapshot == {"frontend/NewFile.tsx": None}


def test_snapshot_capture_rejects_binary(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    # Write a real binary file directly (ProjectWriter/EmittedFile is text-only).
    root = Path(project["generated_project_path"])
    (root / "logo.png").write_bytes(b"\x89PNG\r\n\x1a\n\x00\x00\x00")
    with pytest.raises(ChangeSnapshotError):
        ChangeSnapshotService().capture(project, ["logo.png"])


def test_snapshot_capture_enforces_total_size_cap(make_project) -> None:
    big_content = "x" * (MAX_SNAPSHOT_TOTAL_BYTES + 1)
    project = make_project([("frontend/Huge.tsx", "small")])
    root = Path(project["generated_project_path"])
    (root / "frontend" / "Huge.tsx").write_text(big_content, encoding="utf-8")
    with pytest.raises(ChangeSnapshotError):
        ChangeSnapshotService().capture(project, ["frontend/Huge.tsx"])


def test_snapshot_restore_writes_back_and_deletes(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "old content")])
    service = ChangeSnapshotService()
    snapshot = service.capture(project, ["frontend/Button.tsx", "frontend/New.tsx"])

    writer = ProjectWriter()
    writer.append(project["project_id"], [
        EmittedFile(path="frontend/Button.tsx", content="new content"),
        EmittedFile(path="frontend/New.tsx", content="brand new file"),
    ])
    assert service.files_service.read_file(project, "frontend/Button.tsx")["content"] == "new content"
    assert service.files_service.read_file(project, "frontend/New.tsx")["content"] == "brand new file"

    service.restore(project["project_id"], snapshot, writer=writer)

    assert service.files_service.read_file(project, "frontend/Button.tsx")["content"] == "old content"
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc_info:
        service.files_service.read_file(project, "frontend/New.tsx")
    assert exc_info.value.status_code == 404


# =================================================================== diffing


def test_build_file_diffs_added_and_modified() -> None:
    before = {"a.py": "line1\n", "b.py": None}
    after = {
        "a.py": EmittedFile(path="a.py", content="line1\nline2\n"),
        "b.py": EmittedFile(path="b.py", content="brand new\n"),
    }
    diffs = build_file_diffs(before, after)
    by_path = {d.path: d for d in diffs}
    assert by_path["a.py"].change_kind == "modified"
    assert "+line2" in by_path["a.py"].unified_diff
    assert by_path["b.py"].change_kind == "added"
    assert by_path["b.py"].before is None


def test_build_file_diffs_deleted() -> None:
    before = {"old.py": "will be removed\n"}
    diffs = build_file_diffs(before, {}, deleted=["old.py"])
    assert len(diffs) == 1
    assert diffs[0].change_kind == "deleted"
    assert diffs[0].after is None
    assert "-will be removed" in diffs[0].unified_diff


def test_build_file_diffs_no_op_produces_empty_unified_diff() -> None:
    before = {"same.py": "unchanged\n"}
    after = {"same.py": EmittedFile(path="same.py", content="unchanged\n")}
    diffs = build_file_diffs(before, after)
    assert diffs[0].unified_diff == ""


# ======================================================= classification engine

from app.engines.change_classification_engine import classify_change
from app.schemas.llm import LLMResponse, Provider


@pytest.mark.parametrize(
    "intent,expected_category",
    [
        ("mude a cor do botao de login", "visual_only"),
        ("aumente o espacamento entre os cards", "visual_only"),
        ("troque o icone do menu", "visual_only"),
        ("adicione uma nova API de pagamentos", "blueprint_version"),
        ("crie uma nova tela de relatorios", "blueprint_version"),
        ("adicione permissao de administrador", "blueprint_version"),
        ("migre o sistema para arquitetura multi-tenant", "new_blueprint"),
        ("crie um novo modulo de faturamento com nova arquitetura", "new_blueprint"),
    ],
)
def test_deterministic_classification_categories(intent: str, expected_category: str) -> None:
    result = classify_change(intent, use_llm=False)
    assert result.category == expected_category
    assert result.degraded is True


def test_classification_defaults_up_scope_when_no_keyword_matches() -> None:
    result = classify_change("faca o sistema funcionar melhor", use_llm=False)
    assert result.category == "blueprint_version"
    assert result.degraded is True


def test_classification_button_color_never_requires_backend() -> None:
    """Literal vault acceptance criterion: 'mude a cor do botao' must classify
    visual_only, never implying a backend change."""
    result = classify_change("mude a cor do botao", use_llm=False)
    assert result.category == "visual_only"
    assert result.blueprint_impact == "none"


def test_classification_skips_llm_when_no_key_and_no_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.engines.change_classification_engine.ai_available", lambda: False)

    class _ExplodingRouter:
        def route(self, *args, **kwargs):  # pragma: no cover - must never be called
            raise AssertionError("router.route should not be called when no LLM is available")

    result = classify_change("mude a cor do botao", router=_ExplodingRouter(), use_llm=True)
    assert result.category == "visual_only"


def test_classification_ignores_mock_fallback_response() -> None:
    class _FallbackRouter:
        def route(self, *args, **kwargs):
            return LLMResponse(
                provider=Provider.anthropic, model="mock", text="{}",
                parsed={"category": "visual_only", "reason": "mock", "blueprint_impact": "none"},
                served_by_fallback=True,
            )

    result = classify_change(
        "adicione uma nova API de pagamentos", router=_FallbackRouter(), api_key="fake-key", use_llm=True
    )
    # served_by_fallback must never be trusted -- falls through to the
    # deterministic heuristic, which correctly flags this as blueprint_version.
    assert result.category == "blueprint_version"
    assert result.degraded is True


def test_classification_uses_real_llm_response_when_not_degraded() -> None:
    class _RealRouter:
        def route(self, *args, **kwargs):
            return LLMResponse(
                provider=Provider.anthropic, model="claude", text="{}",
                parsed={"category": "new_blueprint", "reason": "real llm reasoning", "blueprint_impact": "new_blueprint"},
                served_by_fallback=False,
            )

    result = classify_change("mude a cor do botao", router=_RealRouter(), api_key="fake-key", use_llm=True)
    assert result.category == "new_blueprint"
    assert result.degraded is False


# =============================================================== impact engine

from app.engines.change_impact_engine import analyze_impact
from app.schemas.change_request import ClassificationResult


def _visual_classification() -> ClassificationResult:
    return ClassificationResult(category="visual_only", reason="cor", blueprint_impact="none")


def test_impact_fails_closed_without_llm(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content"), ("backend/app.py", "content")])
    result = analyze_impact(project, "mude a cor do botao", _visual_classification(), use_llm=False)
    assert result.affected_files == []
    assert result.requires_backend_change is True
    assert result.degraded is True


def test_impact_uses_real_llm_response_and_filters_hallucinated_paths(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content"), ("backend/app.py", "content")])

    class _RealRouter:
        def route(self, *args, **kwargs):
            return LLMResponse(
                provider=Provider.anthropic, model="claude", text="{}",
                parsed={
                    "affected_files": ["frontend/Button.tsx", "made/up/path.tsx"],
                    "out_of_scope_risk": [],
                    "requires_backend_change": False,
                    "requires_blueprint_update": False,
                    "summary": "Somente o botao muda.",
                },
                served_by_fallback=False,
            )

    result = analyze_impact(
        project, "mude a cor do botao", _visual_classification(),
        router=_RealRouter(), api_key="fake-key", use_llm=True,
    )
    assert result.affected_files == ["frontend/Button.tsx"]
    assert result.requires_backend_change is False
    assert result.degraded is False


def test_impact_ignores_mock_fallback_response(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])

    class _FallbackRouter:
        def route(self, *args, **kwargs):
            return LLMResponse(
                provider=Provider.anthropic, model="mock", text="{}",
                parsed={"affected_files": ["frontend/Button.tsx"], "requires_backend_change": False},
                served_by_fallback=True,
            )

    result = analyze_impact(
        project, "mude a cor do botao", _visual_classification(),
        router=_FallbackRouter(), api_key="fake-key", use_llm=True,
    )
    assert result.degraded is True
    assert result.affected_files == []


def test_impact_fails_closed_when_llm_finds_nothing_real(make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])

    class _EmptyRouter:
        def route(self, *args, **kwargs):
            return LLMResponse(
                provider=Provider.anthropic, model="claude", text="{}",
                parsed={
                    "affected_files": ["completely/made/up.tsx"],
                    "out_of_scope_risk": [], "requires_backend_change": False,
                    "requires_blueprint_update": False, "summary": "",
                },
                served_by_fallback=False,
            )

    result = analyze_impact(
        project, "mude a cor do botao", _visual_classification(),
        router=_EmptyRouter(), api_key="fake-key", use_llm=True,
    )
    assert result.affected_files == []
    assert result.requires_backend_change is True


# ================================================================ patch engine

from app.engines.change_patch_engine import ChangePatchEngine


def _file_block(path: str, content: str) -> str:
    return f'<<<FILE path="{path}">>>\n{content}\n<<<END>>>\n'


def test_patch_engine_accepts_in_scope_and_rejects_out_of_scope() -> None:
    text = (
        _file_block("frontend/Button.tsx", "export const Button = () => <button className='red' />;")
        + _file_block("backend/app.py", "# sneaky out-of-scope backend change")
        + '<<<MANIFEST>>>\n{"files": ["frontend/Button.tsx", "backend/app.py"]}\n<<<END>>>\n'
    )

    class _Router:
        def route(self, *args, **kwargs):
            return LLMResponse(provider=Provider.anthropic, model="claude", text=text)

    snapshot = {"frontend/Button.tsx": "export const Button = () => <button className='blue' />;"}
    result = ChangePatchEngine().generate_patch(
        "mude a cor do botao para vermelho", ["frontend/Button.tsx"], snapshot, router=_Router(), api_key="fake-key"
    )

    assert [f.path for f in result.accepted_files] == ["frontend/Button.tsx"]
    assert result.rejected_out_of_scope == ["backend/app.py"]
    assert len(result.diffs) == 1
    assert result.diffs[0].path == "frontend/Button.tsx"
    assert result.diffs[0].change_kind == "modified"
    assert "red" in result.diffs[0].unified_diff


def test_patch_engine_no_files_returned() -> None:
    text = '<<<MANIFEST>>>\n{"files": []}\n<<<END>>>\n'

    class _Router:
        def route(self, *args, **kwargs):
            return LLMResponse(provider=Provider.anthropic, model="claude", text=text)

    result = ChangePatchEngine().generate_patch(
        "mude a cor do botao", ["frontend/Button.tsx"], {"frontend/Button.tsx": "x"}, router=_Router(), api_key="fake-key"
    )
    assert result.accepted_files == []
    assert result.rejected_out_of_scope == []
    assert result.diffs == []


def test_patch_engine_new_file_in_scope_is_added() -> None:
    text = _file_block("frontend/NewWidget.tsx", "export const NewWidget = () => <div />;")

    class _Router:
        def route(self, *args, **kwargs):
            return LLMResponse(provider=Provider.anthropic, model="claude", text=text)

    result = ChangePatchEngine().generate_patch(
        "crie um novo widget", ["frontend/NewWidget.tsx"], {"frontend/NewWidget.tsx": None},
        router=_Router(), api_key="fake-key",
    )
    assert [f.path for f in result.accepted_files] == ["frontend/NewWidget.tsx"]
    assert result.diffs[0].change_kind == "added"


# ========================================================= orchestration service

from app.engines.change_patch_engine import ChangePatchResult
from app.schemas.change_request import CONSCIOUS_APPROVAL_PHRASE
from app.schemas.generation_validation import BuildValidationReport
from app.schemas.runtime_functional_test import RuntimeFunctionalTestReport
from app.services.change_request_service import ChangeRequestError, ChangeRequestService


def _ok_build_report() -> BuildValidationReport:
    return BuildValidationReport(installed="passed", built="passed", ok=True)


def _failed_build_report() -> BuildValidationReport:
    return BuildValidationReport(installed="passed", built="failed", ok=False)


def _unsupported_preview_report(project_id: str) -> RuntimeFunctionalTestReport:
    return RuntimeFunctionalTestReport(project_id=project_id, supported=False, reason="stack unsupported", generated_at="t")


class _FakePatchEngine:
    def __init__(self, accepted: list[EmittedFile] | None = None, rejected: list[str] | None = None):
        self._accepted = accepted or []
        self._rejected = rejected or []

    def generate_patch(self, intent, scope, snapshot, **kwargs):
        after = {f.path: f for f in self._accepted}
        diffs = build_file_diffs(snapshot, after)
        return ChangePatchResult(accepted_files=self._accepted, rejected_out_of_scope=self._rejected, diffs=diffs, manifest={})


class _FakeBuildService:
    def __init__(self, report: BuildValidationReport):
        self._report = report

    def validate(self, project, **kwargs):
        return self._report


class _FakePreviewService:
    def __init__(self, report: RuntimeFunctionalTestReport):
        self._report = report

    def run(self, project, coverage=None):
        return self._report


class _ScriptedRouter:
    """Returns a canned LLMResponse keyed by the `agent_role` kwarg, so a single
    fake router can serve both classify_change's and analyze_impact's calls."""

    def __init__(self, responses: dict[str, LLMResponse]):
        self._responses = responses

    def route(self, *args, **kwargs):
        return self._responses[kwargs["agent_role"]]


def _scripted_router(affected_files: list[str], *, requires_backend_change: bool = False, category: str = "visual_only") -> _ScriptedRouter:
    return _ScriptedRouter({
        "change_classification": LLMResponse(
            provider=Provider.anthropic, model="claude", text="{}",
            parsed={"category": category, "reason": "r", "blueprint_impact": "none" if category == "visual_only" else "version_bump"},
            served_by_fallback=False,
        ),
        "change_impact": LLMResponse(
            provider=Provider.anthropic, model="claude", text="{}",
            parsed={
                "affected_files": affected_files, "out_of_scope_risk": [],
                "requires_backend_change": requires_backend_change,
                "requires_blueprint_update": category != "visual_only", "summary": "s",
            },
            served_by_fallback=False,
        ),
    })


def _advance_to_approved(service: ChangeRequestService, cr_id: str, owner: str, *, affected_files: list[str]) -> dict:
    router = _scripted_router(affected_files)
    service.analyze(cr_id, owner, router=router, api_key="fake-key")
    service.plan(cr_id, owner, router=router, api_key="fake-key")
    return service.approve(cr_id, owner, CONSCIOUS_APPROVAL_PHRASE)


def test_orchestration_happy_path_draft_to_accepted(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "export const Button = () => <button className='blue' />;")])
    patch_engine = _FakePatchEngine(accepted=[
        EmittedFile(path="frontend/Button.tsx", content="export const Button = () => <button className='red' />;")
    ])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )

    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="mude a cor do botao para vermelho")
    assert cr["status"] == "Draft"

    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])
    assert cr["status"] == "Approved"

    cr = service.apply(cr["change_request_id"], "user_a")
    assert cr["status"] == "Validating"
    assert cr["diff"][0]["path"] == "frontend/Button.tsx"
    assert cr["build_result"]["ok"] is True
    assert cr["preview_result"]["supported"] is False

    cr = service.accept(cr["change_request_id"], "user_a")
    assert cr["status"] == "Accepted"
    assert cr["result"]["outcome"] == "accepted"

    # the file really changed on disk
    content = GeneratedProjectService().read_file(project, "frontend/Button.tsx")["content"]
    assert "red" in content


def test_orchestration_build_failure_restores_snapshot_and_rejects(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "original content")])
    patch_engine = _FakePatchEngine(accepted=[EmittedFile(path="frontend/Button.tsx", content="broken content")])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_failed_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])

    with pytest.raises(ChangeRequestError):
        service.apply(cr["change_request_id"], "user_a")

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Rejected"
    assert "restaurado" in final["result"]["reason"]

    # the original content must be back on disk
    content = GeneratedProjectService().read_file(project, "frontend/Button.tsx")["content"]
    assert content == "original content"


def test_orchestration_out_of_scope_patch_is_rejected_hard(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content"), ("backend/app.py", "content")])
    patch_engine = _FakePatchEngine(
        accepted=[EmittedFile(path="frontend/Button.tsx", content="new content")],
        rejected=["backend/app.py"],
    )
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="mude a cor do botao")
    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])

    with pytest.raises(ChangeRequestError):
        service.apply(cr["change_request_id"], "user_a")

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Rejected"
    # nothing was written -- backend/app.py must be untouched, frontend/Button.tsx too
    content = GeneratedProjectService().read_file(project, "frontend/Button.tsx")["content"]
    assert content == "content"


def test_orchestration_explicit_rollback_after_accepted(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "original content")])
    patch_engine = _FakePatchEngine(accepted=[EmittedFile(path="frontend/Button.tsx", content="changed content")])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])
    cr = service.apply(cr["change_request_id"], "user_a")
    cr = service.accept(cr["change_request_id"], "user_a")
    assert cr["status"] == "Accepted"

    content = GeneratedProjectService().read_file(project, "frontend/Button.tsx")["content"]
    assert content == "changed content"

    cr = service.rollback(cr["change_request_id"], "user_a", "usuario nao gostou do resultado")
    assert cr["status"] == "Rolled Back"
    content = GeneratedProjectService().read_file(project, "frontend/Button.tsx")["content"]
    assert content == "original content"


def test_orchestration_approve_rejects_wrong_confirmation_phrase(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    service = ChangeRequestService(repository=cr_repo)
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    router = _scripted_router(["frontend/Button.tsx"])
    service.analyze(cr["change_request_id"], "user_a", router=router, api_key="fake-key")
    service.plan(cr["change_request_id"], "user_a", router=router, api_key="fake-key")

    with pytest.raises(ChangeRequestError):
        service.approve(cr["change_request_id"], "user_a", "senha errada")

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Planned"


def test_orchestration_base_version_drift_detected_at_apply(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content v1")])
    patch_engine = _FakePatchEngine(accepted=[EmittedFile(path="frontend/Button.tsx", content="content v2")])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])

    # Someone else changes the file on disk after planning, before apply().
    ProjectWriter().append(project["project_id"], [EmittedFile(path="frontend/Button.tsx", content="drifted content")])

    with pytest.raises(ChangeRequestError):
        service.apply(cr["change_request_id"], "user_a")

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Approved"  # unchanged -- the drift check fires before any snapshot/write


def test_orchestration_concurrent_apply_on_same_project_fails_closed_not_racing(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content v1")])
    patch_engine = _FakePatchEngine(accepted=[EmittedFile(path="frontend/Button.tsx", content="content v2")])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    cr = _advance_to_approved(service, cr["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])

    # Simulate another apply() already in flight for this project by holding
    # the same per-project lock a real concurrent request would contend on.
    lock = service._project_lock(project["project_id"])
    lock.acquire()
    try:
        with pytest.raises(ChangeRequestError, match="Outra alteracao"):
            service.apply(cr["change_request_id"], "user_a")
    finally:
        lock.release()

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Approved"  # rejected before touching snapshot/patch/write

    # The lock is released again afterwards -- a real apply() can now proceed.
    updated = service.apply(cr["change_request_id"], "user_a")
    assert updated["status"] == "Validating"


def test_orchestration_conflict_diagnostic_names_the_other_change_request(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content v1")])
    patch_engine = _FakePatchEngine(accepted=[EmittedFile(path="frontend/Button.tsx", content="content v2")])
    service = ChangeRequestService(
        repository=cr_repo, patch_engine=patch_engine,
        build_service=_FakeBuildService(_ok_build_report()),
        preview_service=_FakePreviewService(_unsupported_preview_report(project["project_id"])),
    )

    cr_a = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="CR-A: ajusta o botao")
    cr_a = _advance_to_approved(service, cr_a["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])
    cr_b = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="CR-B: ajusta o mesmo botao")
    cr_b = _advance_to_approved(service, cr_b["change_request_id"], "user_a", affected_files=["frontend/Button.tsx"])

    applied_a = service.apply(cr_a["change_request_id"], "user_a")
    assert applied_a["status"] == "Validating"
    accepted_a = service.accept(cr_a["change_request_id"], "user_a")
    assert accepted_a["status"] == "Accepted"

    with pytest.raises(ChangeRequestError) as exc_info:
        service.apply(cr_b["change_request_id"], "user_a")

    assert cr_a["change_request_id"] in str(exc_info.value.reason)
    assert "CR-A" in str(exc_info.value.reason)


def test_orchestration_visual_only_with_backend_impact_blocks_plan(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content"), ("backend/app.py", "content")])
    service = ChangeRequestService(repository=cr_repo)
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="mude a cor do botao")
    router = _scripted_router(["backend/app.py"], requires_backend_change=True, category="visual_only")
    service.analyze(cr["change_request_id"], "user_a", router=router, api_key="fake-key")

    with pytest.raises(ChangeRequestError):
        service.plan(cr["change_request_id"], "user_a", router=router, api_key="fake-key")

    final = service.get(cr["change_request_id"], "user_a")
    assert final["status"] == "Analyzed"  # blocked before Planned


def test_orchestration_owner_isolation_returns_none(cr_repo: ChangeRequestRepository, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    service = ChangeRequestService(repository=cr_repo)
    cr = service.create(owner_user_id="user_a", project_id=project["project_id"], intent="ajuste")
    assert service.analyze(cr["change_request_id"], "user_b") is None
    assert service.get(cr["change_request_id"], "user_b") is None


# ======================================================================= routes


def _register_second_user(client) -> str:
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


def _create_cr_via_api(client, project_id: str, intent: str = "mude a cor do botao") -> dict:
    response = client.post("/api/change-requests", json={"project_id": project_id, "intent": intent})
    assert response.status_code == 201, response.text
    return response.json()


def test_route_create_and_get(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])
    assert cr["status"] == "Draft"
    assert cr["project_id"] == project["project_id"]

    fetched = client.get(f"/api/change-requests/{cr['change_request_id']}")
    assert fetched.status_code == 200
    assert fetched.json()["change_request_id"] == cr["change_request_id"]


def test_route_create_unknown_project_is_404(client) -> None:
    response = client.post("/api/change-requests", json={"project_id": "does-not-exist", "intent": "ajuste"})
    assert response.status_code == 404


def test_route_list_by_project_and_owner(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])

    by_project = client.get(f"/api/change-requests?project_id={project['project_id']}")
    assert by_project.status_code == 200
    assert [item["change_request_id"] for item in by_project.json()] == [cr["change_request_id"]]

    by_owner = client.get("/api/change-requests")
    assert by_owner.status_code == 200
    assert cr["change_request_id"] in [item["change_request_id"] for item in by_owner.json()]


def test_route_get_is_404_for_other_owner(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])

    other_token = _register_second_user(client)
    response = client.get(f"/api/change-requests/{cr['change_request_id']}", headers={"Authorization": f"Bearer {other_token}"})
    assert response.status_code == 404


def test_route_analyze_then_plan_without_llm_fails_closed(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])
    crid = cr["change_request_id"]

    analyzed = client.post(f"/api/change-requests/{crid}/analyze", json={})
    assert analyzed.status_code == 200, analyzed.text
    assert analyzed.json()["status"] == "Analyzed"

    planned = client.post(f"/api/change-requests/{crid}/plan", json={})
    # No LLM provider configured in tests -> impact analysis fails closed (empty
    # scope), so plan() must reject with a 409 diagnostic, never silently proceed.
    assert planned.status_code == 409
    assert planned.json()["detail"]["status_current"] == "Analyzed"


def test_route_approve_wrong_phrase_is_409(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])
    crid = cr["change_request_id"]
    client.post(f"/api/change-requests/{crid}/analyze", json={})
    # Can't reach Planned without an LLM in this test environment; approve()
    # itself still must reject a wrong-status/wrong-phrase call with a 409.
    response = client.post(f"/api/change-requests/{crid}/approve", json={"confirmation": "errado"})
    assert response.status_code == 409


def test_route_diff_endpoint_on_fresh_cr(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])
    response = client.get(f"/api/change-requests/{cr['change_request_id']}/diff")
    assert response.status_code == 200
    assert response.json()["files"] == []


def test_route_delete(client, make_project) -> None:
    project = make_project([("frontend/Button.tsx", "content")])
    cr = _create_cr_via_api(client, project["project_id"])
    crid = cr["change_request_id"]
    response = client.delete(f"/api/change-requests/{crid}")
    assert response.status_code == 204
    assert client.get(f"/api/change-requests/{crid}").status_code == 404


def test_route_delete_unknown_is_404(client) -> None:
    response = client.delete("/api/change-requests/cr_doesnotexist")
    assert response.status_code == 404
