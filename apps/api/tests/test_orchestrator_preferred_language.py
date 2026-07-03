from __future__ import annotations

from app.engines.orchestrator_engine import enforce_preferred_language
from app.schemas.orchestrator import ProjectSpec, SuggestedStack


def _spec(language: str, framework: str = "", runtime: str = "") -> ProjectSpec:
    return ProjectSpec(
        raw_intent="quero um sistema de pedidos",
        suggested_stack=SuggestedStack(language=language, framework=framework, runtime=runtime),
    )


def test_no_preference_keeps_the_model_suggestion() -> None:
    spec = enforce_preferred_language(_spec("python", "fastapi"), None)
    assert spec.suggested_stack.language == "python"
    assert spec.suggested_stack.framework == "fastapi"


def test_unknown_preference_is_ignored() -> None:
    spec = enforce_preferred_language(_spec("python", "fastapi"), "cobol")
    assert spec.suggested_stack.language == "python"


def test_divergent_model_choice_is_overridden_with_the_canonical_stack() -> None:
    # The model picked TypeScript on its own; the user chose Go — the user wins.
    spec = enforce_preferred_language(_spec("typescript", "nestjs", "nodejs"), "go")
    stack = spec.suggested_stack
    assert stack.language == "go"
    assert stack.runtime == "go_runtime"
    assert stack.framework == "gin"
    assert "usuario" in stack.language_reason


def test_matching_language_keeps_the_model_framework() -> None:
    # Within the user's language the model's framework choice stands (e.g. the
    # LLM chose Django for a content-heavy app and the user chose Python).
    spec = enforce_preferred_language(_spec("Python 3.12", "django", "python_runtime"), "python")
    stack = spec.suggested_stack
    assert stack.language == "python"  # canonicalized id
    assert stack.framework == "django"


def test_alias_preferences_resolve_to_profile_ids() -> None:
    spec = enforce_preferred_language(_spec("python", "fastapi"), "c#")
    stack = spec.suggested_stack
    assert stack.language == "csharp"
    assert stack.framework == "aspnet_core"
