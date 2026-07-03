# Mock Detection Audit

## The one mock that governs the default experience — CRITICAL
**`engines/llm/mock_adapter.py::MockAdapter`** is the deterministic generator the router falls
back to whenever no API key is reachable (`mock_fallback_enabled=True` by default). It is the
single most impactful "fake AI" surface because **it stands in for every LLM call by default.**

What it fabricates deterministically:
- **ProjectSpec** (`_build_project_spec`, lines 84-130): `target_users`, `business_rules`,
  `core_workflows`, `non_functional` are **hardcoded constants** — identical for every idea.
  Only `entities` (a weak regex over capitalized words, lines 238-248) and `suggested_stack`
  (keyword match, `_infer_stack`) vary, and both fall to defaults (`["Item","User"]`,
  `python/fastapi`) on ordinary Portuguese input.
- **Generated code** (`_files_backend_python`, `_files_frontend`, … lines 341-737): fixed
  per-stack skeletons with the entity name substituted in. This is a template, not generation.
- **Completeness report** (`_build_completeness_report`): heuristic from path-name matching.

Impact classification: **CRITICAL** — in the absence of a key, the entire "AI" value
proposition is this file.

## Other mocks/placeholders (lower impact)
| Item | File | Class | Note |
|---|---|---|---|
| Frontend MockRepository / MSW | generated projects (by design) | **Low** | A real, desirable feature (frontend runs without backend) — legitimately a mock. |
| `force_mock` switch | `core/config.py:100` | Low | Intentional offline/test toggle (`LDCN_FORCE_MOCK=1`). |
| Git provider service | `services/git_provider_service.py` | **Moderate** | Verify whether real GitHub/GitLab pushes happen or are simulated (export tests use a fake service). |
| send-to-generator (earlier) | now a real GenerationJob | Resolved | Was a placeholder; now hands off to the real pipeline. |

## Honest note
The mock is **honestly labelled** (`served_by_fallback`/`degraded` everywhere, "Modo
Determinístico" banner). The platform does not lie about it. But "honestly labelled mock" is
still a mock: a first-time user without a key sees deterministic output, not AI.
