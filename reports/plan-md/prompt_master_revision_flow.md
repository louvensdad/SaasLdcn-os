# PromptMaster.md — Revision Flow

## Endpoints involved
- `POST /project-rooms/{id}/message` — each user turn re-runs the orchestrator with the
  full conversation (first message = `raw_intent`; later messages = `prior_answers`),
  refreshing the stored `ProjectSpec`. Status → `UNDER_REVIEW`.
- `POST /project-rooms/{id}/generate-prompt` — compiles version *n* of PromptMaster.md
  from the current spec. Status → `PROMPT_READY`.
- `POST /project-rooms/{id}/revise-prompt` — folds an adjustment into the spec (orchestrator
  turn) **and** regenerates a new PromptMaster.md version. Status stays `PROMPT_READY`.

## Versioning
- Every generation/revision appends to `prompt_master_versions` (monotonic `version`),
  and `prompt_master_md` always reflects the latest. History is preserved (audit-friendly).
- Frontend shows the live preview with the current version label; the **Editar** action
  lets the user tweak the Markdown locally and **Copiar** copies it.

## Guards
- Revise before any generation → HTTP 409 (`"Gere o PromptMaster.md uma primeira vez…"`).
- A foreign/unknown room → HTTP 404 (existence never leaked).

## Test evidence (`tests/test_project_rooms.py`)
- `test_revise_prompt_adds_new_version` — after generate + revise, `prompt_master_versions`
  has length 2 with versions `[1, 2]`, status `PROMPT_READY`.
- `test_short_idea_produces_spec_and_messages` — message turn records user + assistant
  messages and a derived spec.

**Result:** revision/correction loop validated. ✅
