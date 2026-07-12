# Backend Agent — Chunking Strategy

**Date:** 2026-06-28

## Two meanings of "chunking"
The task lists a 10-step Backend breakdown (structure → entities → DTOs → controllers → services → repositories → auth → tests → OpenAPI → validate). It is important to be precise about what is implemented vs. planned.

### Implemented now — *context* chunking (input side)
The **input** to each agent is bounded and focused:
- the Backend agent receives only its sections + owned blueprint areas + a **contract summary**, within a 52k-char budget;
- oversized context is compressed before sending (budget guard);
- a residual 413 triggers an automatic **partitioned** retry with harder compression.

This directly removes the 413 cause (the request is never too large) and is fully tested.

### Existing — *stage* chunking (pipeline already API-First)
Generation is already split into independent agent stages — `contracts → backend → frontend → qa → devops → docs` — each a separate call (`/meta-factory/generate-stage`), so the Backend stage is itself a bounded unit. Earlier stages contribute only a **summary** (contract) to later ones, not raw output.

### Not implemented — *output* chunking (one stage → many sub-calls)
Splitting the single Backend agent into 10 sequential sub-generations (each emitting a subset of files with only the slice it needs) is **not** built. It is the natural next step for projects so large that even a bounded single Backend call can't emit all files within one output budget.

**Proposed design (follow-up):**
1. Backend stage gets a sub-plan: `[entities, dtos, repositories, services, controllers, auth, tests, wiring]`.
2. Each sub-call receives: project backbone (compressed) + contract summary + the **previously emitted file paths** + only the slice it owns.
3. Files accumulate via the existing `ProjectWriter.append` (already supports incremental, cumulative persistence).
4. A final `validate` sub-step runs the existing build/quality gate.

The plumbing already exists (`ProjectWriter.append`, per-stage routes, Context Packs); the remaining work is the sub-plan orchestration loop for a single stage.

## Honest status
- ✅ Input/context chunking + budget + 413 retry — done, tested.
- ✅ Stage-level separation — pre-existing, now payload-safe.
- ⏳ Output chunking (Backend → N sub-calls) — designed, not implemented; needed only for the very largest projects, which now at least no longer 413 on the single call.
