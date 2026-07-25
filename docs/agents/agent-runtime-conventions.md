# Agent Runtime Conventions

status: Phase 0 of the LDCN Multi-Agent Runtime proposal. This document and `apps/api/app/runtime/agent_registry.py` are additive — nothing here changes the behavior of any existing engine.

## 1. Why this exists

A repo-wide audit (2026-07) found that the "specialized agents coordinated by one orchestrator" pattern already existed in at least six places in LDCN OS — `GenerationJobEngine`'s per-role dispatch, the `RootCauseInvestigator → CauseValidator → RepairEngineer` recovery triad, the `QualityGateEngine → AutoRepairEngine → LlmRepairEngine` deep-verification chain, `MissionDeliverableJobEngine`, and others — built independently, with no shared name or catalog. Two of them (the recovery triad and the deep-verification chain) turned out to be the same pattern built twice.

This document is not a proposal to build a new abstraction layer. It is the convention for the one thing that was actually missing: a place to look up "which agents exist, what can each one touch, and where is it implemented" before writing a seventh implementation of the same pattern.

## 2. What an agent is, here

An agent is any unit of work with:

- a single, statable objective;
- a bounded set of inputs and outputs;
- an explicit list of paths it may write to, and what it may never touch;
- a success and a failure criterion that can be checked programmatically, not just "it didn't crash."

An agent does **not** need to call an LLM. Half the registry today is deterministic (`root_cause_agent`, `secret_scan_agent`, `build_agent`, ...). "Agent" here means "a scoped responsibility," not "a prompt."

## 3. Adding an entry to the registry

1. Open `apps/api/app/runtime/agent_registry.py`.
2. Add one `AgentDefinition` to the `_AGENTS` tuple. Every field is required except `status` (defaults to `"active"`).
3. Set `implementation` to a real, resolvable reference in the form `module.path:Name`, `module.path:Name.attr`, or `module.path:CONTAINER['key']`. This is not documentation — `apps/api/tests/test_agent_registry.py` imports it and fails the build if it drifts (renamed function, deleted engine, typo). If the agent doesn't exist yet, set `status="planned"` and leave `implementation=""` — a planned agent claiming a real implementation is exactly the kind of aspirational-but-false doc this catalog exists to prevent (see `docs/05-quality-gates.md`'s "Agent gate" for an example of a named checklist item with no corresponding code).
4. Run `python -m pytest apps/api/tests/test_agent_registry.py -q`.

Do not create a second engine that does what an existing `active` entry already does. If the existing one is close but not quite right, extend it — see the migration-order note below.

## 4. What this does *not* do (yet)

- It does not dispatch agents. Orchestrators (`GenerationJobEngine`, `MissionDeliverableJobEngine`) still call their engines directly. A future phase may have them consult the registry instead of hardcoding role names, but that is a behavior change requiring its own tests and is out of scope for Phase 0.
- It does not enforce `allowed_paths`/`forbidden_paths`. Those fields are declarative documentation today, checked by a human reviewer or a future `Agent Scheduler`, not by a runtime guard. Don't rely on them for security — `artifact_security.py`'s real classifier is still the actual enforcement point.
- It does not replace `AGENT_PROMPTS`, `PIPELINE_ORDER`, or `_ROLE_EFFORT` in `factory_pipeline.py`/`agent_prompts.py`. It reads the same names those already define; changing an LLM role's prompt or budget still happens there, not in the registry.

## 5. Existing conventions this catalog follows (unchanged)

Every engine in `apps/api/app/engines/` already follows the same shape, and new agents should too:

- a module-level singleton instance at the bottom of the file (e.g. `quality_gate_engine = QualityGateEngine()`), not a class the caller instantiates;
- fault isolation at the boundary — `except Exception: logger.exception(...)` and never let a side-channel failure (notification, audit log) propagate into the caller's actual work;
- Pydantic `ApiModel` schemas in `apps/api/app/schemas/` for anything crossing an API boundary, plain `@dataclass` for internal-only value objects (see `pipeline_recovery.py` for both patterns side by side);
- never fabricate a value the code cannot back with a real signal — this is the single most consistently enforced convention in this codebase (see `root_cause_investigator.py`'s `evidence: list[str]` requirement, or `functional_completeness_engine.py`'s comment about "never an invented percentage").

## 6. Where the full proposal lives

The registry catalogs today's state (Phase 0). The rest of the phased plan — a unified Event Bus over the three currently-separate event layers, a polymorphic Notification Center, a generalized Recovery Engine, and the consolidation of the two repair chains — is design work, not yet started. See the architecture proposal delivered alongside this document for the full 6-phase migration plan, risks, and required tests before starting Phase 1.
