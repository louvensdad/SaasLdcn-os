# Known Gaps Before Real Generation

This phase delivered the AI Project Room + PromptMaster.md vertical slice. The following
are **intentionally out of scope** and must be addressed before the room can produce real
software end-to-end.

## 1. Real generator wiring — DONE (via unified journey)
- ~~`send-to-generator` is a safe placeholder.~~ **Resolved.** The unified journey now creates
  a **GenerationJob** and hands off to the Meta-Factory (`/meta-factory?projectId=…`), which
  loads the approved spec and runs the real API-First pipeline. On success the room is moved to
  `GENERATED` (`mark-generated`) and linked to the generated `project_id`.
  See `reports/unified_journey.md` and `reports/send_to_generator_placeholder.md`.
- Remaining: the Meta-Factory generation is **user-triggered** (auto-load, not auto-run) by
  design; a one-click auto-run is intentionally not enabled (cost/consent).

## 2. Real workspace model
- Isolation is currently by `owner_user_id`; `workspace_id` is a reserved nullable column.
- Needed: a `workspaces` table + membership + per-workspace RBAC, then scope rooms by
  workspace instead of (or in addition to) owner.

## 3. PromptMaster.md persisted edits
- The "Editar" action edits the Markdown client-side only (for copy/tweak). There is no
  endpoint to persist a hand-edited document as a new version. Add `PUT …/prompt-master`
  if manual edits should be saved and versioned server-side.

## 4. PDF contract input
- Upload-a-PDF-to-seed-requirements is not implemented. Would feed extracted requirements
  into the orchestrator turn.

## 5. Git export / billing / deploy
- Deferred per scope. Export already exists for generated projects (meta-factory) but is
  not connected to the room flow.

## 6. LLM streaming in the room
- Room turns are request/response (5-min timeout). Streaming (SSE) like the meta-factory
  pipeline would improve UX for slow models.

## 7. Tests not yet added
- Frontend has no component/e2e tests for the room pages (backend is covered by
  `tests/test_project_rooms.py`). Build + typecheck + i18n audit pass.

## Status snapshot
- Backend suite: **262 passed**. Frontend: typecheck clean, build ok.
- The user can already: create a room → describe an idea → get a complete PromptMaster.md
  → revise → approve → send (placeholder). The remaining gap to "real software" is item #1.
