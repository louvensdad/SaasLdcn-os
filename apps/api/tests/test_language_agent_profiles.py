from __future__ import annotations

import shutil
import tempfile
from pathlib import Path

import pytest

from app.data.language_agent_profiles import (
    LANGUAGE_AGENT_PROFILES,
    LANGUAGE_AWARE_ROLES,
    ecosystem_brief,
    language_manifest,
    language_specialist_block,
    resolve_language_id,
    specialist_catalog,
)
from app.engines.agent_prompts import AGENT_PROMPTS, BACKEND_RULES, ORCHESTRATOR_SYSTEM_PROMPT, system_prompt_for
from app.engines.architect_engine import _deterministic_blueprint
from app.engines.llm.mock_adapter import _role_for_system
from app.engines.prompt_master_md_engine import build_prompt_master_md
from app.schemas.generation_validation import BuildValidationReport
from app.schemas.orchestrator import ProjectSpec, SuggestedStack
from app.services.build_validation_service import BuildValidationService, _MetricsCollector


# --------------------------------------------------------------------------- #
# Language resolution
# --------------------------------------------------------------------------- #

@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("python", "python"),
        ("Python 3.12", "python"),
        ("Node.js + TypeScript", "typescript"),
        ("JavaScript", "typescript"),
        ("C# (.NET 8)", "csharp"),
        ("dotnet", "csharp"),
        ("Golang", "go"),
        ("go", "go"),
        ("Java 21", "java"),
        ("PHP 8 / Laravel", "php"),
        ("Rust", "rust"),
        ("Ruby on Rails", "ruby"),
        ("Kotlin", "kotlin"),
    ],
)
def test_resolve_language_id_normalizes_stack_values(raw, expected):
    assert resolve_language_id(raw) == expected


def test_resolve_language_id_falls_back_to_none():
    assert resolve_language_id(None) is None
    assert resolve_language_id("") is None
    assert resolve_language_id("cobol") is None
    # Short aliases must never match inside other words ("go" in "django").
    assert resolve_language_id("django") == "python" or resolve_language_id("django") is None
    assert resolve_language_id("django") != "go"
    assert resolve_language_id("mongodb") is None


def test_every_profile_is_complete():
    for language_id, profile in LANGUAGE_AGENT_PROFILES.items():
        assert profile["label"], language_id
        assert profile["backend_rules"].strip(), language_id
        assert profile["ecosystem_notes"].strip(), language_id
        assert profile["manifest"].strip(), language_id
        assert isinstance(profile.get("aliases", []), list), language_id


def test_python_backend_rules_warn_about_package_vs_flat_file_duplication():
    # Confirmed live (2026-07-09): app/domain/models/__init__.py and
    # app/domain/interfaces/__init__.py were left empty while a complete,
    # correctly-named flat models.py/interfaces.py sat unused as a sibling --
    # Python silently prefers the package, orphaning every import.
    rules = LANGUAGE_AGENT_PROFILES["python"]["backend_rules"]
    assert "__init__.py" in rules
    assert "reexportar" in rules


def test_python_backend_rules_warn_about_passlib_bcrypt_pin():
    # Confirmed live (2026-07-09): passlib==1.7.4 + unpinned bcrypt (resolved to
    # 5.0.0) broke registration with "password cannot be longer than 72 bytes"
    # on a short password.
    rules = LANGUAGE_AGENT_PROFILES["python"]["backend_rules"]
    assert "bcrypt<4.1" in rules


def test_backend_rules_require_jti_on_persisted_jwts():
    # Confirmed live (2026-07-09): a refresh token issued right after login (same
    # wall-clock second) encoded identically to the login's own token and
    # violated a UNIQUE constraint on the stored token column, 500ing /auth/refresh.
    assert "jti" in BACKEND_RULES


# --------------------------------------------------------------------------- #
# Project Room planning flow (Orchestrator → PromptMaster → Architect)
# --------------------------------------------------------------------------- #

def test_orchestrator_prompt_carries_specialist_catalog_and_respects_user_choice():
    assert specialist_catalog() in ORCHESTRATOR_SYSTEM_PROMPT
    assert "RESPEITE-OS" in ORCHESTRATOR_SYSTEM_PROMPT  # explicit user stack wins


def test_contracts_prompt_warns_about_unquoted_yaml_colons():
    # Confirmed live (2026-07-08): the Contracts Agent wrote
    # `description: Nome da coluna (ex: "A Fazer")` unquoted into openapi.yaml,
    # and the bare ": " broke YAML parsing for the whole file.
    assert "dois-pontos" in AGENT_PROMPTS["contracts"]
    assert "aspas" in AGENT_PROMPTS["contracts"]


def test_ecosystem_brief_is_role_agnostic_and_graceful():
    brief = ecosystem_brief("go", "Gin")
    assert '<ecosystem_knowledge language="go"' in brief
    assert "go.mod" in brief and "Framework alvo: Gin." in brief
    assert ecosystem_brief("cobol") == ""
    assert ecosystem_brief(None) == ""


def test_language_manifest_resolves_per_ecosystem():
    assert language_manifest("Python 3.12") == "requirements.txt"
    assert language_manifest("C# (.NET 8)") == "*.csproj"
    assert language_manifest("cobol") is None


def _spec(language: str, framework: str) -> ProjectSpec:
    return ProjectSpec(
        raw_intent="API de pedidos",
        product_summary="Plataforma de pedidos",
        entities=["Pedido"],
        suggested_stack=SuggestedStack(language=language, framework=framework),
    )


def test_deterministic_prompt_master_describes_the_real_ecosystem():
    document = build_prompt_master_md(_spec("go", "Gin"), degraded=True, version=1)
    markdown = document["markdown"]
    assert "Go Specialist" in markdown  # backend section carries the ecosystem
    assert "`go.mod` (manifesto de dependências do backend)." in markdown
    # Unknown language stays generic without crashing.
    fallback = build_prompt_master_md(_spec("cobol", ""), degraded=True, version=1)
    assert "Manifesto de dependências do backend (conforme a stack)." in fallback["markdown"]


def test_deterministic_blueprint_cites_language_specialist():
    blueprint = _deterministic_blueprint(_spec("php", "Laravel"), "room-1")
    backend = next(d for d in blueprint.decisions if d.area == "backend")
    assert "PHP Specialist" in backend.justification
    assert "composer install" in backend.justification
    # Unknown language keeps the generic justification.
    generic = _deterministic_blueprint(_spec("cobol", ""), "room-2")
    backend_generic = next(d for d in generic.decisions if d.area == "backend")
    assert "Specialist" not in backend_generic.justification


# --------------------------------------------------------------------------- #
# Prompt composition
# --------------------------------------------------------------------------- #

def test_backend_prompt_gains_language_specialist_block():
    prompt = system_prompt_for("backend", "Python 3.12", "FastAPI")
    assert prompt.startswith(AGENT_PROMPTS["backend"])  # stable prefix (cache + mock)
    assert '<language_specialist language="python"' in prompt
    assert "requirements.txt" in prompt
    assert "Framework alvo: FastAPI." in prompt


def test_language_aware_roles_receive_block_for_every_language():
    for language_id in LANGUAGE_AGENT_PROFILES:
        for role in LANGUAGE_AWARE_ROLES:
            block = language_specialist_block(role, language_id)
            assert f'language="{language_id}"' in block, (role, language_id)


def test_devops_block_carries_toolchain_not_code_layout():
    block = language_specialist_block("devops", "go")
    assert "go build" in block
    assert "cmd/<app>/main.go" not in block  # backend layout stays out of devops


def test_prompt_falls_back_gracefully():
    # Role without language awareness: untouched.
    assert system_prompt_for("contracts", "python") == AGENT_PROMPTS["contracts"]
    # Unknown language: untouched.
    assert system_prompt_for("backend", "cobol") == AGENT_PROMPTS["backend"]
    assert system_prompt_for("backend", None) == AGENT_PROMPTS["backend"]


def test_mock_adapter_resolves_role_from_composed_prompt():
    assert _role_for_system(AGENT_PROMPTS["qa"]) == "qa"
    assert _role_for_system(system_prompt_for("backend", "go")) == "backend"
    assert _role_for_system(system_prompt_for("devops", "csharp")) == "devops"
    assert _role_for_system("prompt desconhecido") == "backend"


# --------------------------------------------------------------------------- #
# Modernize flow (detection → specialist factory run)
# --------------------------------------------------------------------------- #

def _empty_inventory():
    from app.schemas.modernize import CodebaseInventory

    return CodebaseInventory(
        ingest_id="ing-1", source="zip", file_count=0, total_bytes=0,
        skipped_count=0, languages={}, files=[],
    )


@pytest.mark.parametrize(
    ("names", "expected_language", "expected_label"),
    [
        ({"composer.json", "package.json"}, "php", "PHP / Composer"),  # Laravel + assets
        ({"go.mod", "package.json"}, "go", "Go"),  # Go monorepo + web frontend
        ({"Cargo.toml"}, "rust", "Rust / Cargo"),
        ({"build.gradle.kts"}, "kotlin", "Kotlin / Gradle"),
        ({"Orders.csproj", "appsettings.json"}, "csharp", "C# / .NET"),
        ({"tsconfig.json", "package.json"}, "typescript", "TypeScript / Node.js"),
        ({"package.json"}, "javascript", "Node.js"),
        ({"Gemfile", "package.json"}, "ruby", "Ruby"),  # Rails + assets
    ],
)
def test_modernize_stack_detection_covers_all_specialist_ecosystems(names, expected_language, expected_label):
    from app.engines.codebase_analysis_engine import _detect_stack

    label, language = _detect_stack(names, _empty_inventory())
    assert language == expected_language
    assert label == expected_label


def test_modernize_factory_runs_with_detected_language_specialists(monkeypatch):
    from app.engines import modernization_engine
    from app.schemas.modernize import Diagnosis

    diagnosis = Diagnosis(
        detected_stack="PHP / Composer", primary_language="php", languages=["php"],
        dependency_notes=[], smells=[], security_findings=[],
    )
    monkeypatch.setattr(
        modernization_engine, "compile_modernization_prompt",
        lambda *args, **kwargs: "mega",
    )
    captured: dict = {}

    def fake_pipeline(mega, **kwargs):  # noqa: ANN001
        captured.update(kwargs, mega=mega)
        return "pipeline-result"

    monkeypatch.setattr(modernization_engine, "run_factory_pipeline", fake_pipeline)
    result = modernization_engine.modernize_with_factory(
        "ing-1", None, diagnosis, None, None, user_model_choice="m", api_key="k",
    )
    assert result == "pipeline-result"
    assert captured["language"] == "php"
    assert captured["framework"] == "PHP / Composer"


# --------------------------------------------------------------------------- #
# Build validation dispatch for the new ecosystems
# --------------------------------------------------------------------------- #

def test_dispatch_detects_go_dotnet_php_gradle_and_cargo(monkeypatch):
    root = Path(tempfile.mkdtemp(prefix="ldcn-lang-build-"))
    try:
        (root / "go.mod").write_text("module example.com/app\n", encoding="utf-8")
        (root / "backend").mkdir()
        (root / "backend" / "composer.json").write_text("{}", encoding="utf-8")
        (root / "apps" / "api").mkdir(parents=True)
        (root / "apps" / "api" / "Cargo.toml").write_text("[package]\n", encoding="utf-8")
        (root / "apps" / "api" / "build.gradle.kts").write_text("plugins {}\n", encoding="utf-8")
        (root / "apps" / "api" / "App.csproj").write_text("<Project/>", encoding="utf-8")

        service = BuildValidationService()
        visited: list[tuple[str, Path]] = []

        def runner_for(name: str):
            def run(target, *_args):  # noqa: ANN001
                visited.append((name, target))
                return BuildValidationReport(installed="passed", built="passed", ok=True)
            return run

        for name in ["_python", "_node", "_maven", "_gradle", "_go", "_composer", "_cargo", "_dotnet"]:
            monkeypatch.setattr(service, name, runner_for(name))

        report = service._dispatch(root, _MetricsCollector())
        assert report.ok is True
        seen = {(name, path.relative_to(root).as_posix() or ".") for name, path in visited}
        assert seen == {
            ("_go", "."),
            ("_composer", "backend"),
            ("_cargo", "apps/api"),
            ("_gradle", "apps/api"),
            ("_dotnet", "apps/api"),
        }
    finally:
        shutil.rmtree(root, ignore_errors=True)


def test_missing_toolchain_skips_gracefully(monkeypatch):
    root = Path(tempfile.mkdtemp(prefix="ldcn-lang-skip-"))
    try:
        service = BuildValidationService()
        monkeypatch.setattr("app.services.build_validation_service.shutil.which", lambda _name: None)
        for runner in [service._go, service._cargo, service._dotnet, service._composer, service._gradle]:
            report = runner(root, _MetricsCollector())
            assert report.ok is True
            assert report.installed == "skipped"
            assert report.skipped_reason
    finally:
        shutil.rmtree(root, ignore_errors=True)
