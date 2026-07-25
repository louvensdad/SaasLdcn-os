# Agent Specifications

status: Phase 0 of the LDCN Multi-Agent Runtime proposal is live — see [agent-runtime-conventions.md](./agent-runtime-conventions.md) and `apps/api/app/runtime/agent_registry.py`.

purpose: the catalog of every specialized agent already running in LDCN OS, plus the convention for adding one. Phases 1+ (unified Event Bus, generalized Notification Center, generalized Recovery Engine) are not started.

not active in runtime: the registry is a read-only catalog — it does not dispatch, schedule, or gate anything yet. No pipeline behavior changed when it was added.

