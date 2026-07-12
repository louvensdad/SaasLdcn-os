# Quality Gate + Revalidation Loop

**Engine:** `apps/api/app/engines/quality_gate_engine.py` (`QualityGateEngine`)

## The loop
Detect → Explain → Fix → Revalidate → Release.
- **Detect/Explain:** `evaluate(project, run_build)` composes the deterministic checks
  (`GeneratedProjectQualityEngine.quality_check`) and, when `run_build=True`, the **real build**
  (`generation_validation_engine.validate`, npm/pip/mvn) + dependency audit. Each problem becomes
  a `QualityIssue` with **severity**, **root cause**, **suggested fix** and **auto_fixable**.
- **Fix:** `AutoRepairEngine.repair` applies the safe fixes (see
  `auto_repair_engine_foundation.md`).
- **Revalidate:** `POST /meta-factory/{id}/revalidate` re-runs the gate (real build by default)
  and returns `RevalidationResult { report, remaining_ids, … }`.
- **Release:** allowed only when `passed` (no BLOCKER) or a conscious override is on.

## Severity policy
- **BLOCKER** (cannot release): build failure, missing mandatory file, real `.env`/secret,
  path traversal/symlink/zip escape, missing dependency, unsupported framework, failed required
  structural check.
- **WARNING** (release with warning): docs/run-instructions, `package.json` scripts, missing
  health endpoint, outdated dependency, quality nits.
- **INFO:** suggestions.

## Endpoints
`POST /meta-factory/{id}/validate?build=true` · `GET …/quality-report` (fast, no build) ·
`POST …/repair` · `POST …/revalidate?build=true` · `POST …/force-release`.

## Report shape
`QualityGateReport { passed, can_release, release_override, score, built, blocker_count,
warning_count, info_count, issues[] }` (contract: `packages/contracts/quality-gate.contract.ts`).

## Tests
Gate fails with blockers; issues flagged `auto_fixable`; revalidation clears the fixed issues;
a synthetic failing build maps to a BLOCKER (covers the real-build path deterministically).
