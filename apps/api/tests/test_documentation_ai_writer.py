from __future__ import annotations

import shutil

import pytest

from pathlib import Path

from app.engines.documentation_ai_writer import DETERMINISTIC_BANNER, MIN_DOCS, DocumentationAiWriter
from app.schemas.llm import LLMResponse, Provider
from test_backend_generation import _create_backend_project, _request
from test_documentation import _make_project_dir, _project

GOOD = {f.replace("docs/", "").split("/")[-1]: "x" for _, f, _ in MIN_DOCS}


class _FakeRouter:
    """Returns a non-fallback LLM response so the writer takes the real-AI path."""

    def __init__(self, content: str) -> None:
        self._content = content
        self.calls = 0

    def route(self, req, *, user_choice=None, agent_role=None, api_key=None):
        self.calls += 1
        return LLMResponse(
            provider=Provider.anthropic,
            model="claude-opus-4-8",
            text="",
            parsed={"content": self._content},
            served_by_fallback=False,
        )


def test_generate_deterministic_fallback_is_honest():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter()  # no server key, no api_key -> deterministic
        result = writer.generate(_project(root))
        assert result["ai_active"] is False
        assert result["mode"] == "deterministic"
        ids = {doc["id"] for doc in result["docs"]}
        assert {"readme", "architecture", "api", "database", "security", "testing", "deployment", "adr_0001"} <= ids
        for doc in result["docs"]:
            assert doc["mode"] == "deterministic"
            assert DETERMINISTIC_BANNER.strip() in doc["content"]
            assert doc["safe"] is True
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_generate_with_llm_provider_marks_mode_llm():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter(router=_FakeRouter("# Real AI README\n\nProject-specific prose."))
        result = writer.generate(_project(root), doc_ids=["readme"], api_key="user-key")
        assert result["ai_active"] is True
        assert result["mode"] == "ai"
        assert len(result["docs"]) == 1
        doc = result["docs"][0]
        assert doc["id"] == "readme"
        assert doc["mode"] == "llm"
        assert "Real AI README" in doc["content"]
        assert DETERMINISTIC_BANNER.strip() not in doc["content"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_generate_redacts_secrets_from_llm_output():
    root = _make_project_dir({})
    try:
        leaked = "# Setup\n\nUse api_key = 'sk_test_0000000000000000000000' in production."
        writer = DocumentationAiWriter(router=_FakeRouter(leaked))
        result = writer.generate(_project(root), doc_ids=["readme"], api_key="user-key")
        doc = result["docs"][0]
        assert "sk_test_0000000000000000000000" not in doc["content"]
        assert "<redacted>" in doc["content"]
        assert doc["safe"] is True
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_regenerate_single_document():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter()
        result = writer.generate(_project(root), doc_ids=["architecture"])
        assert [doc["id"] for doc in result["docs"]] == ["architecture"]
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_save_writes_approved_docs_and_validates():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter()
        generated = writer.generate(_project(root))
        items = [{"id": doc["id"], "content": doc["content"]} for doc in generated["docs"]]
        saved = writer.save(_project(root), items)
        assert saved["blocked"] is False
        assert all(result["written"] for result in saved["saved"])
        assert (root / "README.md").is_file()
        assert (root / "docs" / "ARCHITECTURE.md").is_file()
        assert (root / "docs" / "adr" / "0001-initial-architecture.md").is_file()
        # Generated docs pass the library's own validation.
        analysis = writer.doc_engine.analyze(_project(root))
        assert analysis["missing_required"] == []
        assert analysis["safe"] is True
        assert saved["score"] >= 80
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_save_does_not_overwrite_without_confirmation():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter()
        items = [{"id": "readme", "content": "# First\n\nOriginal content kept for the project README."}]
        first = writer.save(_project(root), items)
        assert first["saved"][0]["written"] is True

        second = writer.save(_project(root), [{"id": "readme", "content": "# Second\n\nShould not overwrite."}])
        assert second["saved"][0]["written"] is False
        assert second["saved"][0]["skipped"] is True
        assert "First" in (root / "README.md").read_text(encoding="utf-8")

        third = writer.save(_project(root), [{"id": "readme", "content": "# Third\n\nOverwrite confirmed for the README."}], overwrite=True)
        assert third["saved"][0]["written"] is True
        assert "Third" in (root / "README.md").read_text(encoding="utf-8")
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_generate_and_save_endpoints(client):
    project = _create_backend_project(client, "fastapi")
    output = Path("generated-projects") / "active" / f"docgen-{project['project_id']}"
    run = client.post("/api/backend-generation/run", json=_request(project, "fastapi", output, profile_id="crud_api"))
    assert run.status_code == 200

    gen = client.post(
        f"/api/projects/{project['project_id']}/documentation/generate",
        json={"doc_ids": ["readme", "architecture"]},
    )
    assert gen.status_code == 200
    payload = gen.json()
    assert payload["ai_active"] is False  # no provider in tests -> deterministic
    assert payload["mode"] == "deterministic"
    assert {doc["id"] for doc in payload["docs"]} == {"readme", "architecture"}

    items = [{"id": doc["id"], "content": doc["content"]} for doc in payload["docs"]]
    saved = client.post(
        f"/api/projects/{project['project_id']}/documentation/save",
        json={"docs": items, "overwrite": True},
    )
    assert saved.status_code == 200
    body = saved.json()
    assert body["blocked"] is False
    assert all(item["written"] for item in body["saved"])


def test_save_sanitizes_secrets_before_writing():
    root = _make_project_dir({})
    try:
        writer = DocumentationAiWriter()
        items = [{"id": "security", "content": "# Security\n\ntoken = 'LeakedRealToken1234567890'"}]
        result = writer.save(_project(root), items)
        assert result["blocked"] is False
        written = (root / "docs" / "SECURITY.md").read_text(encoding="utf-8")
        assert "LeakedRealToken1234567890" not in written  # never persisted
        assert "<redacted>" in written
    finally:
        shutil.rmtree(root, ignore_errors=True)
