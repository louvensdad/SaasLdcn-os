# AI Project Room — Security Validation

## Isolation (workspace/RBAC)
- No `workspaces` table exists in the codebase. Decision (confirmed with the user):
  **scope every room by `owner_user_id`**; a nullable `workspace_id` column is reserved
  for a future real workspace model.
- All repository reads/writes are owner-scoped. A room belonging to another user resolves
  to `None` → the route returns **HTTP 404** (not 403), so existence is never leaked.
- Test: `test_user_cannot_access_another_users_room` — user B gets 404 on user A's room
  and the room never appears in user B's listing.

## Secret handling (never persist / never log)
- Shared helper `apps/api/app/repositories/redaction.py` masks secret-looking keys
  (`secret|token|password|api_key|private_key|credential`) and inline `key=value` secrets.
- Applied before persistence to: chat message content, the stored `ProjectSpec`, the
  `raw_intent`, and the generation handoff.
- **API keys are never persisted on a room.** The user's own LLM key is resolved per-request
  from the ephemeral `user_key_session` (mirroring the meta-factory `_resolve_api_key` rule)
  and passed only to the orchestrator call; it never reaches the repository.
- Test: `test_secrets_are_redacted_in_messages` — a message containing `api_key=sk-…` and
  `token=…` is stored redacted; the raw secret never appears in the serialized room and
  `[REDACTED]` is present.

## Deterministic mode (never fake AI)
- When no LLM is reachable, `run_orchestrator` is served by the deterministic `MockAdapter`
  (`served_by_fallback=True` → `degraded=True`). This is surfaced honestly:
  - room/messages carry `degraded`,
  - the PromptMaster.md gets a "⚠️ Modo Determinístico" banner,
  - the UI shows a "Modo Determinístico" badge.
- Test: `test_deterministic_mode_is_flagged_not_faked`.

## Transport / auth
- The router is mounted under the global `Depends(get_current_user)` (JWT bearer);
  unauthenticated requests are rejected before reaching the handler.

**Result:** isolation, secret redaction and honest degraded-mode validated. ✅
