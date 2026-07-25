# Agent Specifications

status: Phases 0, 1, 2, and 4 of the LDCN Multi-Agent Runtime proposal are live:
- Phase 0 — [agent-runtime-conventions.md](./agent-runtime-conventions.md), `apps/api/app/runtime/agent_registry.py`
- Phase 1 — GenerationJob notifications also publish to the unified Event Bus (`app/core/event_catalog.py`)
- Phase 2 — `generation_notifications` gained a polymorphic `entity_type`/`entity_id` subject, additive
- Phase 4 — [validation-and-repair-chains.md](./validation-and-repair-chains.md): the two independently-built diagnose-repair chains, formally cataloged via `agent_registry.by_chain()` so a third isn't built by accident

Phase 3 (generalizing the Recovery Engine beyond `ProjectWriteError`) was investigated and intentionally deferred — see validation-and-repair-chains.md's "real gap" section for why, and what's needed before picking it up.

purpose: the catalog of every specialized agent already running in LDCN OS, plus the convention for adding one.

not active in runtime: the registry is a read-only catalog — it does not dispatch, schedule, or gate anything yet. No pipeline behavior changed when it was added.

