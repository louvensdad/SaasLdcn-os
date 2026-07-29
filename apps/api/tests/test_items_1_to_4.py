from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

from app.core.config import get_settings
from app.core.database import Base, database_url_for, get_engine
import app.models  # noqa: F401
from app.engines import prompt_master_md_engine as pm_engine
from app.repositories.modernize_job_repository import ModernizeJobRepository
from app.schemas.orchestrator import ProjectSpec
from app.services.ai_availability import ai_status

_KEY_ENVS = ["OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "DEEPSEEK_API_KEY", "GROQ_API_KEY"]


# --- Item 1: AI as default / status ---------------------------------------- #

def _clear_keys(monkeypatch) -> None:
    for env in _KEY_ENVS:
        monkeypatch.delenv(env, raising=False)
    monkeypatch.delenv("LDCN_FORCE_MOCK", raising=False)
    get_settings.cache_clear()


def test_ai_status_endpoint_shape(client):
    response = client.get("/api/ai-status")
    assert response.status_code == 200
    body = response.json()
    assert set(body) >= {"ai_active", "mode", "providers"}
    assert body["mode"] in {"ai", "deterministic_preview"}


def test_ai_status_deterministic_preview_without_keys(monkeypatch):
    _clear_keys(monkeypatch)
    try:
        status = ai_status()
        assert status["ai_active"] is False
        assert status["mode"] == "deterministic_preview"
        assert status["providers"] == []
    finally:
        get_settings.cache_clear()


def test_ai_status_active_with_server_key(monkeypatch):
    _clear_keys(monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-server-test")
    get_settings.cache_clear()
    try:
        status = ai_status()
        assert status["ai_active"] is True
        assert status["mode"] == "ai"
        assert "openai" in status["providers"]
    finally:
        get_settings.cache_clear()


def test_promptmaster_authored_by_llm_when_ai_available(monkeypatch):
    """A server provider (no user key) makes the PromptMaster LLM-authored by default."""
    monkeypatch.setattr("app.services.ai_availability.ai_available", lambda: True)

    class _Resp:
        text = "# PromptMaster — Teste\n\n## Visão Geral\nDocumento autorado pela IA."
        served_by_fallback = False
        parsed = None

    class _Router:
        def route(self, *_args, **_kwargs):
            return _Resp()

    monkeypatch.setattr("app.engines.llm.router.LLMRouter", _Router)

    spec = ProjectSpec(raw_intent="Quero um SaaS para clínica", product_summary="SaaS clínica")
    doc = pm_engine.author_prompt_master_md(spec, version=1)  # no user api_key
    assert doc["degraded"] is False
    assert "Documento autorado pela IA." in doc["markdown"]
    assert "## Visão Geral" in doc["markdown"]  # heading contract preserved


# --- Item 3: Modernize jobs persist across restart ------------------------- #

def test_modernize_job_persists_and_is_owner_scoped():
    tmp = Path(tempfile.mkdtemp())
    db = tmp / "jobs.db"
    try:
        database_url = database_url_for(db)
        Base.metadata.create_all(bind=get_engine(database_url))
        repo_a = ModernizeJobRepository(db)
        repo_a.create(owner_user_id="user-a", project_id="ingest_x", data={"source": "zip", "report": None})
        repo_a.update("ingest_x", "user-a", {"report": {"ok": True}})

        # Simulate a restart: a brand-new repo instance reads the persisted job.
        repo_b = ModernizeJobRepository(db)
        loaded = repo_b.get_for_owner("ingest_x", "user-a")
        assert loaded is not None and loaded["report"] == {"ok": True}

        # Owner isolation: a different owner cannot read it.
        assert repo_b.get_for_owner("ingest_x", "user-b") is None
    finally:
        if 'database_url' in locals():
            get_engine(database_url).dispose()
        shutil.rmtree(tmp, ignore_errors=True)
