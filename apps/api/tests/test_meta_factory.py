from __future__ import annotations

from app.data.agent_territories import path_in_territory, territory_violations
from app.data.model_registry import resolve_model
from app.engines.factory_pipeline import run_factory_pipeline
from app.engines.llm.base import LLMAdapter
from app.engines.llm.google_adapter import GoogleAdapter
from app.engines.llm.openai_adapter import OpenAIAdapter
from app.engines.llm.router import LLMRouter
from app.engines.orchestrator_engine import compile_mega_prompt, localization_rules, run_orchestrator
from app.schemas.llm import LLMRequest, LLMResponse, Provider, ReasoningLevel
from app.services.file_protocol import EmittedFile, parse_agent_output
from app.services.project_writer import ProjectWriter, ProjectWriteError


# --- file protocol parser -------------------------------------------------

VALID_OUTPUT = """<<<FILE path="openapi.yaml">>>
openapi: 3.1.0
<<<END>>>
<<<MANIFEST>>>
{"files": ["openapi.yaml"], "entrypoint": "openapi.yaml", "assumptions": [], "open_questions": []}
<<<END>>>"""


def test_parse_valid_output():
    parsed = parse_agent_output(VALID_OUTPUT, agent_role="contracts")
    assert parsed.ok
    assert len(parsed.files) == 1
    assert parsed.files[0].path == "openapi.yaml"
    assert parsed.manifest["entrypoint"] == "openapi.yaml"


def test_parse_detects_missing_manifest_and_no_files():
    parsed = parse_agent_output("no blocks here", agent_role="contracts")
    assert not parsed.ok
    assert any("No FILE blocks" in e for e in parsed.errors)
    assert any("Missing MANIFEST" in e for e in parsed.errors)


def test_parse_flags_territory_violation():
    out = (
        '<<<FILE path="apps/api/src/main.py">>>\nx = 1\n<<<END>>>\n'
        '<<<MANIFEST>>>\n{"files": ["apps/api/src/main.py"]}\n<<<END>>>'
    )
    # frontend may not write into apps/api/
    parsed = parse_agent_output(out, agent_role="frontend")
    assert not parsed.ok
    assert any("outside its territory" in e for e in parsed.errors)


# --- territories ----------------------------------------------------------

def test_territory_rules():
    assert path_in_territory("backend", "apps/api/src/domain/x.py")
    assert not path_in_territory("backend", "apps/web/page.tsx")
    assert territory_violations("contracts", ["openapi.yaml", "apps/api/x.py"]) == ["apps/api/x.py"]


# --- model registry -------------------------------------------------------

def test_resolve_model_precedence():
    assert resolve_model(user_choice="claude-sonnet-4-6") == "claude-sonnet-4-6"
    assert resolve_model(agent_role="docs") == "claude-haiku-4-5"
    assert resolve_model() == "claude-opus-4-8"
    # unknown user choice falls back to default
    assert resolve_model(user_choice="not-a-model") == "claude-opus-4-8"


# --- stub adapter so we never touch the network or the SDK ----------------

class _StubAdapter(LLMAdapter):
    def __init__(self, responses: dict[str, str]):
        self.responses = responses
        self.seen: list[tuple[str, LLMRequest]] = []

    def complete(self, model: str, req: LLMRequest) -> LLMResponse:
        self.seen.append((model, req))
        # route by a marker present in the system prompt
        for marker, text in self.responses.items():
            if marker in req.system:
                return LLMResponse(provider=Provider.anthropic, model=model, text=text,
                                   parsed=_maybe_json(req, text), stopped_by="end_turn")
        return LLMResponse(provider=Provider.anthropic, model=model, text="", stopped_by="end_turn")


def _maybe_json(req: LLMRequest, text: str):
    if req.json_schema:
        import json
        return json.loads(text)
    return None


def _router(responses: dict[str, str]) -> LLMRouter:
    return LLMRouter(adapters={"anthropic": _StubAdapter(responses)})


# --- orchestrator ---------------------------------------------------------

SPEC_JSON = (
    '{"raw_intent": "app de barbearia", "product_summary": "SaaS de agendamento", '
    '"target_users": ["cliente"], "business_rules": ["horario unico"], '
    '"entities": ["Agendamento"], "core_workflows": ["reservar"], '
    '"non_functional": {"seguranca": "auth"}, '
    '"suggested_stack": {"language": "TypeScript", "framework": "Next.js", "architecture": "modular-monolith"}, '
    '"locale": "pt-BR", "assumptions": [], "open_questions": [], "confidence": 0.92}'
)


def test_orchestrator_ready_when_confident():
    router = _router({"Orchestrator": SPEC_JSON})
    result = run_orchestrator("app de barbearia", router=router)
    assert result.stage == "READY_TO_COMPILE"
    assert result.spec.business_rules == ["horario unico"]
    assert result.open_questions == []


def test_compile_mega_prompt_includes_business_rules():
    router = _router({"Orchestrator": SPEC_JSON})
    spec = run_orchestrator("app de barbearia", router=router).spec
    mega = compile_mega_prompt(spec)
    assert "horario unico" in mega
    assert "Business rules (priority zero)" in mega


def test_localization_rules_are_strict():
    rules = localization_rules("pt-BR")
    assert "Final output language: pt-BR" in rules
    assert "TRANSLATE 100%" in rules
    assert "DO NOT TRANSLATE" in rules
    assert "camelCase/snake_case" in rules
    assert "i18n" in rules


def test_compile_mega_prompt_injects_chosen_locale():
    router = _router({"Orchestrator": SPEC_JSON})
    spec = run_orchestrator("app de barbearia", router=router).spec
    spec.locale = "en-US"  # user override
    mega = compile_mega_prompt(spec)
    assert "Localization rules (NON-NEGOTIABLE)" in mega
    assert "Final output language: en-US" in mega


# --- pipeline -------------------------------------------------------------

def test_pipeline_runs_all_agents_and_threads_contract():
    contract = (
        '<<<FILE path="openapi.yaml">>>\nopenapi: 3.1.0\n<<<END>>>\n'
        '<<<MANIFEST>>>\n{"files": ["openapi.yaml"]}\n<<<END>>>'
    )
    backend = (
        '<<<FILE path="apps/api/src/main.py">>>\nx = 1\n<<<END>>>\n'
        '<<<MANIFEST>>>\n{"files": ["apps/api/src/main.py"]}\n<<<END>>>'
    )
    generic = (
        '<<<FILE path="docs/x.md">>>\n# x\n<<<END>>>\n'
        '<<<MANIFEST>>>\n{"files": ["docs/x.md"]}\n<<<END>>>'
    )
    stub = _StubAdapter({
        "Agente de Contratos": contract,
        "Agente Backend": backend,
        "Tech-Writer": generic,
    })
    router = LLMRouter(adapters={"anthropic": stub})

    result = run_factory_pipeline("# spec", router=router)
    roles = [r.role for r in result.runs]
    assert roles == ["contracts", "backend", "frontend", "qa", "devops", "docs"]

    # the contract text must be threaded into later agents' context
    backend_ctx = next(req.user for model, req in stub.seen
                       if "Agente Backend" in req.system)
    assert "<contract>" in backend_ctx
    assert "openapi: 3.1.0" in backend_ctx


# --- project writer -------------------------------------------------------

def test_writer_writes_files_and_marker():
    import shutil
    import tempfile
    from pathlib import Path

    base = Path(tempfile.mkdtemp())
    try:
        writer = ProjectWriter(output_root=base)
        result = writer.write(
            [EmittedFile(path="openapi.yaml", content="openapi: 3.1.0"),
             EmittedFile(path="apps/api/src/main.py", content="x = 1")],
            project_name="Barber Shop",
        )
        root = base / result.project_id
        assert result.file_count == 2
        assert (root / "openapi.yaml").read_text(encoding="utf-8") == "openapi: 3.1.0"
        assert (root / "apps/api/src/main.py").read_text(encoding="utf-8") == "x = 1"
        assert (root / ".ldcn-generation.json").is_file()  # browsable by GeneratedProjectService
        assert result.project_id.startswith("barber-shop_")
    finally:
        shutil.rmtree(base, ignore_errors=True)


def test_writer_blocks_path_traversal():
    import shutil
    import tempfile
    from pathlib import Path

    import pytest

    base = Path(tempfile.mkdtemp())
    try:
        writer = ProjectWriter(output_root=base)
        with pytest.raises(ProjectWriteError):
            writer.write([EmittedFile(path="../escape.txt", content="nope")])
    finally:
        shutil.rmtree(base, ignore_errors=True)


# --- route registration ---------------------------------------------------

def test_app_registers_meta_factory_routes():
    from app.main import create_application

    app = create_application()
    paths = {route.path for route in app.routes}
    assert "/api/meta-factory/orchestrate" in paths
    assert "/api/meta-factory/generate" in paths
    assert "/api/meta-factory/{project_id}/files" in paths
    assert "/api/meta-factory/{project_id}/download" in paths


# --- per-provider parameter translation (the core of multi-LLM) -----------

def _req(**kw) -> LLMRequest:
    base = dict(system="sys", user="usr", reasoning=ReasoningLevel.high, creativity=0.4)
    base.update(kw)
    return LLMRequest(**base)


def test_openai_build_params_temperature_vs_reasoning():
    adapter = OpenAIAdapter()
    # chat model: temperature, no reasoning_effort
    chat = adapter._build_params("gpt-4.1", _req(), supports_temperature=True)
    assert chat["temperature"] == 0.4
    assert "reasoning_effort" not in chat
    assert [m["role"] for m in chat["messages"]] == ["system", "user"]
    assert chat["max_completion_tokens"] == 16000

    # reasoning model: reasoning_effort, no temperature
    reasoning = adapter._build_params("o4-mini", _req(), supports_temperature=False)
    assert reasoning["reasoning_effort"] == "high"
    assert "temperature" not in reasoning


def test_openai_build_params_json_schema():
    adapter = OpenAIAdapter()
    params = adapter._build_params("gpt-4.1", _req(json_schema={"type": "object"}), supports_temperature=True)
    assert params["response_format"]["type"] == "json_schema"
    assert params["response_format"]["json_schema"]["schema"] == {"type": "object"}


def test_google_build_config():
    adapter = GoogleAdapter()
    cfg = adapter._build_config(_req())
    assert cfg["system_instruction"] == "sys"
    assert cfg["temperature"] == 0.4
    assert cfg["max_output_tokens"] == 16000
    assert "response_mime_type" not in cfg

    cfg_json = adapter._build_config(_req(json_schema={"type": "object"}))
    assert cfg_json["response_mime_type"] == "application/json"
    assert cfg_json["response_schema"] == {"type": "object"}


def test_router_dispatches_by_provider():
    openai_stub = _StubAdapter({})
    google_stub = _StubAdapter({})
    router = LLMRouter(adapters={
        "anthropic": _StubAdapter({}),
        "openai": openai_stub,
        "google": google_stub,
    })

    router.route(_req(), user_choice="gpt-4.1")
    router.route(_req(), user_choice="gemini-2.5-pro")

    assert [m for m, _ in openai_stub.seen] == ["gpt-4.1"]
    assert [m for m, _ in google_stub.seen] == ["gemini-2.5-pro"]


def test_meta_factory_browse_endpoints_reuse_file_service():
    import shutil
    from pathlib import Path

    from fastapi.testclient import TestClient

    from app.main import create_application

    # Write a real generated project under generated-projects/active (inside the
    # workspace, as the GeneratedProjectService safety check requires).
    writer = ProjectWriter()
    result = writer.write(
        [EmittedFile(path="openapi.yaml", content="openapi: 3.1.0")],
        project_name="browse-test",
    )
    created = Path(result.root_path)
    try:
        from uuid import uuid4

        with TestClient(create_application()) as client:
            register_response = client.post(
                "/api/auth/register",
                json={
                    "email": f"test_{uuid4().hex}@example.com",
                    "password": "TestPassword123!",
                    "full_name": "Test User",
                    "privacy_policy_accepted": True,
                },
            )
            access_token = register_response.json()["tokens"]["access_token"]
            client.headers.update({"Authorization": f"Bearer {access_token}"})

            resp = client.get(f"/api/meta-factory/{result.project_id}/files")
            assert resp.status_code == 200
            names = [f["relative_path"] for f in resp.json()["files"]]
            assert "openapi.yaml" in names

            # invalid id is rejected before touching the filesystem
            assert client.get("/api/meta-factory/bad@id/files").status_code == 400
    finally:
        shutil.rmtree(created, ignore_errors=True)
