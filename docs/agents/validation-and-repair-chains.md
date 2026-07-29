# Validation and Repair Chains

status: LDCN Multi-Agent Runtime, Phase 4. Documentation only — neither chain below was modified to produce this file.

## Why this exists

Two diagnose-repair chains exist in this codebase today, built independently, for the same shape of problem: something is wrong with a generated artifact, figure out why, and fix it if it's safe to. Before adding a *third*, read this — the two existing ones already cover more ground than either author of the second one seems to have known when they started (the recovery triad's own docstring explicitly says it was modeled on the older chain's shape, without merging into it).

Query both from code via `app.runtime.agent_registry.by_chain("deep_verification")` / `by_chain("recovery")`.

## The two chains

| | Deep-verification chain | Recovery chain |
|---|---|---|
| Engines | `QualityGateEngine → AutoRepairEngine → LlmRepairEngine` | `RootCauseInvestigator → CauseValidator → RepairEngineer` |
| Files | `quality_gate_engine.py`, `auto_repair_engine.py`, `llm_repair_engine.py` | `root_cause_investigator.py`, `cause_validator.py`, `repair_engineer.py`, coordinated by `pipeline_recovery_orchestrator.py` |
| Triggered by | Manual call from the deep-verification ("sala de teste") routes (`meta_factory.py`, `modernize.py`) | Automatic, inside `GenerationJobEngine._build()`, when the final `ProjectWriter().write()` raises `ProjectWriteError` |
| Shape | 2 real stages: `evaluate()` already produces typed, severity-ranked `QualityIssue`s (diagnosis and validation are not separable here — a `QualityIssue` already carries `root_cause`/`suggested_fix`/`auto_fixable`) | 3 real, separable stages: investigate (evidence-backed hypothesis) → validate (independent re-check) → repair (only after `confirmed` + approval if required) |
| Deterministic repair tier | `AutoRepairEngine`, keyed by `QualityIssue.id` | None as a separate tier — `RepairEngineer` itself is deterministic (regex-based redaction), not LLM |
| LLM escalation tier | `LlmRepairEngine`, only for issues the deterministic tier left unresolved | **None.** No LLM tier exists in the recovery chain today |
| What it can actually repair | Whatever `AutoRepairEngine`/`LlmRepairEngine` have a fixer registered for | Secret-block causes (`REAL_SECRET`, `UNSAFE_TEMPLATE`, `FALSE_POSITIVE`) **and**, as of Phase 3, `GENERATION_CONFLICT` (competing/duplicate artifacts) |

## The gap this comparison surfaced (2026-07 audit) — closed

`CauseValidator.validate()` can confirm a second cause — `GENERATION_CONFLICT` — computing `canonicalArtifact` and `duplicateArtifacts` for it. Until Phase 3, `RepairEngineer` had no branch for that classification and always fell through to `RepairNotAuthorized`, so every `GENERATION_CONFLICT` landed on `NEEDS_USER_ACTION` even though the data needed to repair it was already computed.

**Closed by `RepairEngineer.repair_generation_conflict()`**: drops the artifacts in `duplicateArtifacts`, keeps `canonicalArtifact`, and re-runs `architecture_analysis.duplicate_basenames()` over the repaired set as its own regression check — same authorization contract as `repair_secret_block` (refuses unless `confirmed` and approved). Deliberately did **not** invent a *new* notion of "canonical": `canonicalArtifact` is computed by `CauseValidator` via `architecture_analysis.pick_canonical`, the exact same function `ArchitectureConsolidationGate` uses for write-time prevention — the two can never disagree about which file wins, because they call the same code, not two independent judgments. `pipeline_recovery_orchestrator.py` dispatches to this method by `classification`, `repair_secret_block` unchanged for the other three classifications.

An empty or non-matching file set still correctly refuses (`RepairNotAuthorized`) rather than reporting a fake success — see `test_generation_conflict_with_no_matching_files_is_not_silently_repaired` in `test_pipeline_recovery.py`.

## Why they are not merged

They solve genuinely different-shaped problems (2-stage vs. 3-stage), triggered from different places (on-demand vs. automatic), for a currently non-overlapping set of causes. Forcing a single class/interface over both would mean either flattening the recovery chain's real validate step into nothing, or inventing a fake validate step for the deep-verification chain that doesn't exist in its actual code. Both are dishonest simplifications.

What *is* shared, and now formalized: both are cataloged in `app.runtime.agent_registry` under the `chain` field, so a future contributor building a third diagnose-repair chain finds these two first.
