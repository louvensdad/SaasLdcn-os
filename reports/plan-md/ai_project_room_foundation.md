# AI Project Room — Foundation

**Branch:** `feat/premium-foundation` · **Status:** implemented, green

## Goal
Deliver the heart of the product: a ChatGPT-style **AI Project Room** where the user
writes an idea in natural language and the system turns it into a professional
**PromptMaster.md**, then lets them revise, approve and hand off to the generator —
with no technical forms.

## Mandatory flow (implemented)
1. User selects context → 2. "Nova Criação com IA" → 3. AI Project Room opens →
4. user writes the idea → 5. LLM **or deterministic mode** interprets →
6. PromptMaster.md generated → 7. user requests adjustments → 8. document updated →
9. user approves → 10. redirected/handed off to generation (safe placeholder).

## What was reused (no reinvention)
- `app/engines/orchestrator_engine.py::run_orchestrator` — natural language → `ProjectSpec`
  (+ `open_questions`, `degraded` flag). The single LLM step.
- LLM router + `MockAdapter` deterministic fallback (`served_by_fallback` ⇒ `degraded`).
- SQLite repository pattern; secret-redaction rules from `project_repository.py`.
- Auth `CurrentUser` for owner-scoped isolation (no workspace table exists yet).

## What was added
| Layer | File |
|---|---|
| Repository | `apps/api/app/repositories/project_room_repository.py` (+ `redaction.py`) |
| Engine | `apps/api/app/engines/prompt_master_md_engine.py` |
| Schemas | `apps/api/app/schemas/project_room.py` |
| Service | `apps/api/app/services/project_room_service.py` |
| Routes | `apps/api/app/routes/project_rooms.py` (registered in `main.py`) |
| Tests | `apps/api/tests/test_project_rooms.py` (+ conftest wiring) |
| Frontend | `lib/api/project-rooms.ts`, `(app)/project-rooms/{,, new, [roomId]}/page.tsx`, nav, i18n×4 |
| Contract | `packages/contracts/project-room.contract.ts` |

## Routes (all `CurrentUser`, owner-scoped, prefix `/api`)
- `GET /project-rooms` · `POST /project-rooms`
- `GET /project-rooms/{id}`
- `POST /project-rooms/{id}/message` · `/generate-prompt` · `/revise-prompt`
- `POST /project-rooms/{id}/approve` · `/send-to-generator`

## Status lifecycle
`DRAFT → UNDER_REVIEW → PROMPT_READY → APPROVED → SENT_TO_GENERATOR`
(each transition guarded server-side; invalid transitions return HTTP 409).

## Verification
- Backend: `python -m pytest` → **262 passed** (incl. 10 new project-room tests).
- Frontend: `npm run typecheck` clean · `npm run build` ok (3 new routes).
- i18n audit: 0 findings in new files (42 keys × 4 locales added).
