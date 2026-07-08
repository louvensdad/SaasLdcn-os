from __future__ import annotations

import shutil
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.engines import engineering_kernel_engine
from app.engines.engineering_kernel_engine import compute_kernel_status
from app.schemas.quality_gate import QualityGateReport
from app.services.file_protocol import EmittedFile
from app.services.project_writer import ProjectWriter

# Same real-files-on-disk pattern as test_functional_completeness_engine.py /
# test_quality_gate_auto_repair.py -- no filesystem mocking.


@pytest.fixture
def make_project():
    created: list[Path] = []
    writer = ProjectWriter()

    def _make(files: list[tuple[str, str]] | None = None, name: str = "kernel-test") -> dict:
        files = files or [("README.md", "# test\n")]
        result = writer.write(
            [EmittedFile(path=path, content=content) for path, content in files], project_name=name,
        )
        created.append(Path(result.root_path))
        return {"project_id": result.project_id, "generated_project_path": result.root_path}

    yield _make
    for root in created:
        shutil.rmtree(root, ignore_errors=True)


def _evidence(status_, evidence_id: str):
    return next(item for item in status_.evidence if item.id == evidence_id)


def test_bare_project_has_real_quality_gate_blockers_and_is_blocked(make_project):
    # A bare project (just a README) is missing the backend generation manifest,
    # .env.example, etc. -- the *existing* QualityGateEngine already flags these
    # as real BLOCKER issues. Unmocked, end-to-end: confirms the Kernel actually
    # wires blocker_count through rather than defaulting to a false "all clear".
    project = make_project()
    status_ = compute_kernel_status(project["project_id"])
    assert status_.state == "BLOCKED"
    assert status_.quality_gate_blocker_count > 0
    assert all(not item.available for item in status_.evidence if item.source == "marker")


def test_no_signals_and_no_blockers_is_partially_verified(make_project, monkeypatch):
    # Isolates the Kernel's own fallback branch from QualityGateEngine's specific
    # manifest/readme/env rules (covered by the real-blocker test above) by
    # stubbing a clean report -- this is the "build passed informally but nothing
    # was ever formally verified" case, which used to fall through _require_verified
    # silently with no label at all.
    project = make_project()
    clean_report = QualityGateReport(
        project_id=project["project_id"], passed=True, can_release=True,
        release_override=False, score=100, built=False, blocker_count=0,
        generated_at="2026-01-01T00:00:00+00:00",
    )
    monkeypatch.setattr(engineering_kernel_engine.quality_gate_engine, "evaluate", lambda *a, **k: clean_report)
    status_ = compute_kernel_status(project["project_id"])
    assert status_.state == "PARTIALLY_VERIFIED"
    assert all(not item.available for item in status_.evidence if item.source == "marker")


def test_verified_build_yields_verified_state(make_project):
    project = make_project()
    ProjectWriter().set_verification(project["project_id"], verified=True, score=95)
    status_ = compute_kernel_status(project["project_id"])
    assert status_.state == "VERIFIED"
    assert status_.build_verified is True
    assert _evidence(status_, "verification").available is True


def test_functional_completeness_blocked_overrides_a_verified_build(make_project):
    project = make_project()
    ProjectWriter().set_verification(project["project_id"], verified=True, score=95)
    ProjectWriter().set_functional_completeness(project["project_id"], report={"status": "BLOCKED", "issues": []})
    status_ = compute_kernel_status(project["project_id"])
    assert status_.state == "BLOCKED"
    assert status_.functional_completeness_status == "BLOCKED"
    assert _evidence(status_, "functional_completeness").available is True


def test_release_override_is_reported(make_project):
    project = make_project()
    ProjectWriter().set_release_override(project["project_id"], by_user="user-1", reason="liberar mesmo assim")
    status_ = compute_kernel_status(project["project_id"])
    assert status_.override_active is True
    assert status_.override_reason == "liberar mesmo assim"
    assert _evidence(status_, "release_override").available is True


def test_needs_human_review_without_acknowledgment_is_not_acknowledged(make_project):
    project = make_project()
    ProjectWriter().set_functional_completeness(project["project_id"], report={"status": "NEEDS_HUMAN_REVIEW", "issues": []})
    status_ = compute_kernel_status(project["project_id"])
    assert status_.state == "NEEDS_HUMAN_REVIEW"
    assert status_.human_review_acknowledged is False
    assert _evidence(status_, "human_review_acknowledgment").available is False


def test_needs_human_review_acknowledgment_does_not_fake_verified(make_project):
    project = make_project()
    ProjectWriter().set_functional_completeness(project["project_id"], report={"status": "NEEDS_HUMAN_REVIEW", "issues": []})
    ProjectWriter().set_human_review_acknowledgment(project["project_id"], by_user="user-1", reason="revisado pelo humano")
    status_ = compute_kernel_status(project["project_id"])
    assert status_.human_review_acknowledged is True
    assert status_.human_review_reason == "revisado pelo humano"
    assert status_.state == "NEEDS_HUMAN_REVIEW"  # still true that the gate couldn't auto-verify it
    assert _evidence(status_, "human_review_acknowledgment").available is True


def test_delivered_evidence_files_are_detected_by_presence(make_project):
    project = make_project(
        [
            ("README.md", "# test\n"),
            ("product-completion-report.json", "{}"),
            ("endpoint-ui-coverage.json", "[]"),
        ]
    )
    status_ = compute_kernel_status(project["project_id"])
    report_item = _evidence(status_, "product_completion_report")
    coverage_item = _evidence(status_, "endpoint_ui_coverage")
    depth_item = _evidence(status_, "ui_depth_score")
    assert report_item.available is True and report_item.path == "product-completion-report.json"
    assert coverage_item.available is True
    assert depth_item.available is False and depth_item.path is None


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


def test_engineering_kernel_route_returns_the_computed_state(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="kernel-route-test", owner=owner_id,
    )
    try:
        ProjectWriter().set_verification(result.project_id, verified=True, score=100)
        response = client.get(f"/api/meta-factory/{result.project_id}/engineering-kernel")
        assert response.status_code == 200, response.text
        assert response.json()["state"] == "VERIFIED"
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_engineering_kernel_route_is_owner_scoped(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="kernel-owner-test", owner=owner_id,
    )
    try:
        other_token = _register_second_user(client)
        response = client.get(
            f"/api/meta-factory/{result.project_id}/engineering-kernel",
            headers={"Authorization": f"Bearer {other_token}"},
        )
        assert response.status_code == 404
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_engineering_kernel_route_404s_for_a_nonexistent_project(client: TestClient) -> None:
    response = client.get("/api/meta-factory/does-not-exist-xyz/engineering-kernel")
    assert response.status_code == 404


def test_acknowledge_human_review_rejects_the_wrong_phrase(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="ack-wrong-phrase", owner=owner_id,
    )
    try:
        ProjectWriter().set_functional_completeness(result.project_id, report={"status": "NEEDS_HUMAN_REVIEW", "issues": []})
        response = client.post(
            f"/api/meta-factory/{result.project_id}/acknowledge-human-review", json={"confirmation": "errado"},
        )
        assert response.status_code == 400
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_acknowledge_human_review_requires_needs_human_review_state(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="ack-no-review-pending", owner=owner_id,
    )
    try:
        ProjectWriter().set_verification(result.project_id, verified=True, score=100)
        response = client.post(
            f"/api/meta-factory/{result.project_id}/acknowledge-human-review",
            json={"confirmation": "REVISADO PELO HUMANO"},
        )
        assert response.status_code == 409
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)


def test_acknowledge_human_review_succeeds_and_unblocks_export(client: TestClient) -> None:
    me = client.get("/api/auth/me")
    owner_id = me.json()["user_id"]
    result = ProjectWriter().write(
        [EmittedFile(path="README.md", content="# test\n")], project_name="ack-success", owner=owner_id,
    )
    try:
        ProjectWriter().set_functional_completeness(result.project_id, report={"status": "NEEDS_HUMAN_REVIEW", "issues": []})
        response = client.post(
            f"/api/meta-factory/{result.project_id}/acknowledge-human-review",
            json={"confirmation": "REVISADO PELO HUMANO"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["human_review_acknowledged"] is True
        assert body["state"] == "NEEDS_HUMAN_REVIEW"  # honest -- not faked as VERIFIED

        # The release gate no longer blocks on FUNCTIONAL_COMPLETENESS_NOT_VERIFIED
        # for this project now that it's been acknowledged.
        download = client.post(f"/api/meta-factory/{result.project_id}/prepare-download")
        assert download.status_code != 409, download.text
    finally:
        shutil.rmtree(result.root_path, ignore_errors=True)
