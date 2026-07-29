# Analytics — Real Data Sources

**Date:** 2026-06-28

Every metric traces to data the LDCN OS already persists. No synthetic values.

| Section | Source (real) | Scope | Notes |
|---------|---------------|-------|-------|
| project_rooms | `ProjectRoomRepository.list_for_owner(user_id)` (SQLite `project_rooms`) | Owner | Status, prompt_master, blueprint, handoff, timestamps. |
| llm | `AuditLogRepository.list_for_user(user_id)` + `llm_settings_service.active(user_id)` | Owner | Event-code counts; active provider **label only**. |
| meta_factory | Derived from rooms (`generation_handoff` + lifecycle status) | Owner | Runs = handoff present or status in meta states. |
| modernize | Audit events (`modernize_*`, `codebase_analysis_*`, `auto_refactor_*`) | Owner | Empty when none recorded. |
| documentation | `ProjectService.list_projects()` (projects with `generated_project_path`) | Global* | Score computed on demand → no persistent metric yet. |
| quality | Audit events (`quality_gate_*`, `auto_repair_*`, `revalidation_*`, `git_export_blocked`) | Owner | Empty when none recorded. |
| technology_trends | `ProjectService.list_projects()` → `technology_graph` (language/framework), `archetype_id` | Global* | Aggregate counts only (no project names in series). |
| laboratory | — | — | No persistent backend → `no_data_source`. |

\* **Scoping note:** `project_rooms`, `llm`, `meta_factory`, `modernize`, `quality` are strictly owner-scoped. `documentation` and `technology_trends` read the generated-projects table, which the existing `/api/projects` endpoint already exposes globally to any authenticated user; analytics only emits **aggregate counts** (technology_trends) or **id+name** (documentation candidates) from it, consistent with current app behavior. Per-owner project scoping is a follow-up (requires an owner column filter on `projects`).

## Derivations (made explicit, not invented)
- **PromptMasters approved** = rooms whose status is `PROMPT_APPROVED` or any later lifecycle state.
- **Sent to Meta-Fábrica** = rooms with a `generation_handoff` or status in `{WAITING_META_FACTORY, META_FACTORY_RUNNING, GENERATING, VALIDATING, READY}`.
- **Meta-Fábrica run completed** = handoff `status == "generated"` or room status `READY`.
- **Agents per run** = the real pipeline order `["contracts","backend","frontend","qa","devops","docs"]` (`PIPELINE_ORDER`).
- **Meta-Fábrica timestamps** = `created_at` (startedAt) and `updated_at` (completedAt, only for terminal `READY`/`FAILED`). These are room timestamps used as honest proxies — there is no separate per-run timing store yet.
