# LLM Reality Audit — where AI is actually called

**Verdict: real LLM integration EXISTS and is well-built, but it only activates when an
API key is present. With no key (the default, offline, tests, demos) every "AI" path
silently degrades to a deterministic `MockAdapter`.**

## The 6 real LLM call sites (all go through `engines/llm/router.py::LLMRouter.route`)
| # | Caller | File | What it sends | What it does with the output |
|---|---|---|---|---|
| 1 | Orchestrator (idea → ProjectSpec) | `engines/orchestrator_engine.py:117` | `ORCHESTRATOR_SYSTEM_PROMPT` + the user's idea; `json_schema=ProjectSpec` | Validates JSON into a `ProjectSpec` (the platform's "understanding") |
| 2 | Factory agents (codegen) | `engines/factory_pipeline.py` (`iter_single_agent`/`run_factory_pipeline`) | `AGENT_PROMPTS[role]` (contracts/backend/frontend/qa/devops/docs) + compiled Mega-Prompt | Parses `<<<FILE>>>` blocks → writes real source files |
| 3 | Verify/repair "sala de teste" | `engines/verification_engine.py` (`_run_repair`) | `REPAIR_SYSTEM_PROMPT` + build logs | Rewrites broken files |
| 4 | Completeness reviewer | `engines/completeness_review_engine.py` | `REVIEWER_SYSTEM_PROMPT`; `json_schema=CompletenessReport` | Coverage report |
| 5 | Modernize analysis enrichment | `engines/modernize_analysis_engine.py` (`analyze_project`) | short narrative prompt | **Optional**; only enriches `business_impact`; scores stay deterministic |
| 6 | Modernize connection test | `routes/modernize.py::modernize_llm_test` | "ping" | ok/fail |

The provider/model are chosen by `MODEL_REGISTRY` + the user's `user_model_choice`. Adapters are
real: `anthropic_adapter`, `openai_adapter`, `google_adapter`, `openrouter_adapter`,
`ollama_adapter`, `custom_adapter` (OpenAI-compatible). The system prompts (`engines/agent_prompts.py`)
are genuine, detailed, professional — this is **not** fake.

## The catch — the fallback governs the default experience
`LLMRouter.route` (`engines/llm/router.py:46-83`):
```
if api_key:                      # user-supplied key -> real call, no mock
    return adapter.complete(...)
if settings.force_mock:          # offline demo / tests
    return self._mock.complete(...)
adapter = self._adapters.get(provider)
try:    return adapter.complete(model, req)        # server env key
except LLMError:
    if settings.mock_fallback_enabled:             # DEFAULT True
        return self._mock.complete(model, req)     # <-- deterministic templates
```
- `mock_fallback_enabled` defaults to **True** (`core/config.py:97`).
- There are **no server API keys in `Settings`** — adapters read `ANTHROPIC_API_KEY`/etc. from env. With none set and no user key, **every call above falls to `MockAdapter`.**
- The fallback is honestly flagged: `served_by_fallback=True` → `degraded=True` surfaces in the UI as "Modo Determinístico". It never *pretends* to be a model — but it is *not* a model.

## Honest conclusion
- **Is there real AI?** Yes — orchestration + 6-agent codegen + repair + review are real LLM
  calls with strong prompts, when a key is configured.
- **Does the product use it by default?** No. Out of the box it is 100% deterministic.
- **The intelligence is real but GATED behind a key**, and even then it is concentrated in
  *spec extraction* and *code generation* — not in the document rendering or the analysis scores
  (see `promptmaster_quality_audit.md`, `template_dependency_audit.md`).
