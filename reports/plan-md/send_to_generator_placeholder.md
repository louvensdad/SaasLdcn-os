# Send to Meta-Factory — GenerationJob Hand-off

> **UPDATE (unified journey):** the placeholder has been replaced by a real **GenerationJob**
> hand-off that redirects to the Meta-Factory with the spec pre-loaded. The original
> placeholder design is kept below for history; see `reports/unified_journey.md` for current
> behavior.

## Current behavior
`send-to-generator` (guard: status `APPROVED`) creates a GenerationJob
`{ handoff_id, project_id (=room_id), workspace_id, prompt_master_version, project_name,
status: "queued", generated_project_id: null }`, sets room status `SENT_TO_GENERATOR`, and the
UI redirects to `/meta-factory?projectId=<roomId>`. The Meta-Factory loads the approved spec,
the user runs generation, and `mark-generated` then moves the project to `GENERATED`.

## Original placeholder design (history)
The product flow ends with "enviar para o gerador". In the first phase, **real code generation
was intentionally NOT wired**, so `send-to-generator` produced a safe, auditable placeholder
handoff only.

## Behavior
- `POST /project-rooms/{id}/send-to-generator`
- **Guard:** only allowed when `status == APPROVED` (otherwise HTTP 409).
- Creates a handoff object and persists it (redacted) on the room:
  ```json
  {
    "handoff_id": "handoff_xxxxxxxxxxxx",
    "status": "queued_placeholder",
    "prompt_master_version": 1,
    "project_name": "…",
    "message": "PromptMaster.md registrado para geração. A geração real de código ainda não está conectada nesta fase — este é um placeholder seguro.",
    "created_at": "…"
  }
  ```
- Status → `SENT_TO_GENERATOR`.
- **No** call to `factory_pipeline` / `meta-factory generate`. **No** files are written,
  no project directory is created, no LLM generation pipeline runs.

## Why this is safe
- It cannot accidentally trigger an expensive or destructive generation run.
- The handoff is the single, explicit integration point for wiring the real generator later
  (see `known_gaps_before_real_generation.md`).
- The frontend surfaces the placeholder notice instead of pretending generation happened.

## Test evidence (`tests/test_project_rooms.py`)
- `test_approve_then_send_to_generator_placeholder` — handoff `status == "queued_placeholder"`,
  room status `SENT_TO_GENERATOR`, version preserved.
- `test_approve_requires_prompt_ready` — approving before a prompt exists → HTTP 409.

**Result:** send-to-generator is a verified safe placeholder. ✅
