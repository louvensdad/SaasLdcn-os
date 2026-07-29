# Production Guarantee Engine — Gap Audit (2026-07-14)

Compares the pasted "LDCN Production Guarantee Engine" master spec against what actually
exists in `apps\api` / `apps\web` today. Scope note: the spec describes a system that audits
**projects the meta-factory generates**, and that's also what nearly all matching real code
does — it does not audit LDCN-OS's own source.

## 1. State machine (spec: 5 states, delivery gated on `CERTIFIED`)

Real system has **no 5-state FSM** and no state literally called `CERTIFIED`.

- `GenerationJobStatus` (`apps\api\app\schemas\generation_job.py:15-25`) — ~27 granular states
  (`QUEUED`, `BACKEND_GENERATING`, `TESTS_RUNNING`, `BUILD_RUNNING`, `READY`, `FAILED`, ...),
  walked linearly by an ordered `STEPS` list in `generation_job_engine.py:105-283`, not a
  declared transition graph.
- Delivery gate is real and does exist: `_require_verified()`
  (`apps\api\app\routes\meta_factory.py:1156-1221`) blocks download unless
  `EngineeringKernelStatus.state == "VERIFIED"` (409 otherwise), computed by
  `engineering_kernel_engine.py`.
- Mapping: GENERATING/ANALYZING/REPAIRING/TESTING all have loose real-world analogues
  (`*_GENERATING`/`*_VALIDATING` sub-states, Build Auto-Repair, `TESTS_RUNNING`). **CERTIFIED
  has no equivalent name** — closest is `VERIFIED`, a separate post-hoc completeness verdict,
  not a unifying pipeline state.

**Gap:** no single named terminal "certified" state; the golden rule ("nothing ships before
CERTIFIED") is enforced in spirit via `_require_verified()`, not via a state machine.

## 2. Quality Gate auditor agents

| Spec role | Status | Real analogue |
|---|---|---|
| Backend Agent Universal | partial | `generated_project_quality_engine.py`, `quality_gate_engine.py`, 9 `language_agent_profiles.py` — folder/manifest/secret checks. **No** import-graph/dead-code/empty-class analysis, **no** real HTTP runtime API testing. |
| Frontend Auditor (spec: critical priority) | partial | `functional_completeness_engine.py` (`_frontend_completeness`, `_ui_depth_score`, `_openapi_frontend_contract_drift`) — regex/filename heuristics + real OpenAPI↔TS field-name drift check. **No** browser automation opens routes to catch blank pages; **no** onClick-wired-to-API check. Not treated as higher priority than other auditors anywhere. |
| Mobile Auditor | partial | `functional_completeness_engine.py:_mobile_completeness` — login/token-storage/screen heuristics. **No** OS permission manifest scanning, **no** runtime navigation test. |
| Security Auditor | partial | `generated_project_quality_engine.py` (secrets, path traversal) + `codebase_analysis_engine.py` (hardcoded creds, `eval`/SQLi/shell-injection patterns, weak hashing). **No** JWT misconfig check, **no** CORS check, **no** auth/authz flaw detection — `gatekeeper_engine.py` only checks that a blueprint *selected* auth/RBAC capabilities, not that code implements them correctly. |
| Dependency Auditor | partial | `dependency_research_service.py` — missing/outdated packages vs. a static curated version table. **No** CVE database, **no** license/SBOM scanning. |
| Runtime Tester | partial | `execution_terminal_service.py` (real sandboxed npm/build/test/audit execution) + `generation_validation_engine.py` (build-pass/fail gate). **No** load testing, **no** autonomous E2E generation (LDCN's own `apps\web` Playwright specs are hand-authored, not agent-driven). |

**Bonus, not in the spec at all:** `ground_truth_engine.py` + `execution_reality_guard.py` —
injects real pipeline/build state into every LLM call and rejects/sanitizes agent claims
(git-clone URLs, "deployed", false success) that contradict actual state. This is a stronger
anti-hallucination mechanism than anything the spec proposes for the auditors themselves.

## 3. Smart Context Engine

Spec wants: failing file + direct deps + affected contract + last architectural decision only.

Real `context_pack_builder.py` is a genuine, tested budget guard
(`ROLE_BUDGET_CHARS`, `compress_to_budget`, confirmed by `test_meta_factory_413.py`), but it's
**role-scoped, not error-scoped**: it filters blueprint sections per generation role
(backend/frontend/qa/...) and summarizes the OpenAPI contract — it has no concept of "the file
with the error" and no dependency graph. There is no persisted decisions/memory store it reads
from at all (grep for "architectural decision" / "project memory" across the repo hits only a
static planning doc).

**Gap:** solves the real incident it was built for (413s from oversized prompts) but doesn't
implement the spec's file/error-scoped RAG behavior.

## 4. Repair-loop report format (auditor → Generator Agent)

Real and reasonably close on **structure**, wrong on **consumer**:

- `QualityIssue` schema (`apps\api\app\schemas\quality_gate.py:17-26`): `id, title, severity,
  category, file, root_cause, suggested_fix, auto_fixable, fix_status` — a genuine
  detect→fix→revalidate→release loop (`meta_factory.py:1080-1153`).
- `ClassifiedBuildError` (`build_error_classifier.py:76-85`) does the same for build failures,
  `MAX_AUTO_REPAIR_ATTEMPTS=2` (`build_validation_service.py:61`).
- **Gap CLOSED for the QualityIssue loop (2026-07-14).** Both "fixers" were hardcoded
  deterministic template/regex patchers keyed by issue ID; neither actually read
  `root_cause`/`suggested_fix` and handed it to an LLM. Added
  `apps/api/app/engines/llm_repair_engine.py` — for BLOCKER `QualityIssue`s the deterministic
  `AutoRepairEngine` has no template for, it builds a scoped context from `root_cause` +
  `suggested_fix` + the implicated file's real content and calls the same "repair" LLM agent
  role `verification_engine.py` already used for build-failure repair. Wired as a new,
  explicit opt-in endpoint `POST /meta-factory/{project_id}/repair/llm` (separate from the
  free/instant deterministic `/repair`, since it costs an LLM call). `build_error_classifier`'s
  separate build-log repair loop is unchanged — still deterministic/regex, still a real gap.

## 5. Project memory (`.ldcn/project-memory.json`)

No single file matches. Closest combo:

- `architecture` + `decisions` → `ldcn.project.json` (`project_manifest_engine.py`,
  written at `generation_job_engine.py:1037-1052`) — **but only written once, after the job
  reaches READY.** Never read back into agent context mid-pipeline.
- `knownProblems` → **no equivalent.** `ground_truth_engine.py` computes live
  `error_trace`/`last_failed_step` but never persists it as a growing log.
- `validatedFiles` → Engineering Kernel's Evidence Store (`engineering_kernel_engine.py`) —
  presence/marker checks against known filenames, not a validated-file audit trail, and lives
  in LDCN's own read path, not shipped inside the generated project.
- The one piece that genuinely is read-before-write and immutable: **`stack.lock.json`**
  (`stack_compatibility.py:273-288`) — but it only covers React/RN/Expo/Node version anchors,
  not architecture/decisions/problems/files.

**Biggest single gap:** nothing in LDCN-OS is read by an agent *before* it generates or fixes
code and updated *after* a successful validation, the way the spec's `.ldcn/` memory demands.
Everything that exists is either write-once-at-the-end or lives only in LDCN's database, never
inside the generated project itself.

---

## Overall verdict

The spec is largely describing, at a conceptual level, a system that **already exists in
substantial partial form** — quality gate, auto-repair loop, context budgeting, functional
completeness auditors, a delivery gate. The three gaps that are real (not just naming
mismatches) and would take actual engineering to close, ranked by leverage:

1. **CLOSED (2026-07-14).** No persistent, read-before-write project memory inside the
   pipeline. This was the architecture-drift/hallucination guard the spec cares most about,
   and had the least existing coverage (`ldcn.project.json` was write-once/post-hoc; no
   `knownProblems` log existed at all). Implemented as `apps/api/app/engines/
   project_memory_engine.py` — `.ldcn/project-memory.json` built at `PREPARING_CONTEXT`,
   injected into every LLM step's context, updated on every successful validation and every
   failure path. 894 backend tests green (up from 719). See memory `project-memory-engine`.
2. **CLOSED (2026-07-14) for the QualityIssue/Quality-Gate loop.** Auto-repair fixers didn't
   consume the structured issue report via an LLM. Implemented `llm_repair_engine.py` +
   `POST /meta-factory/{project_id}/repair/llm`, reusing the existing "repair" agent role. The
   parallel build-error-classifier repair loop (`build_error_classifier.py`) is still
   deterministic-only — not covered by this change.
3. **PARTIALLY CLOSED (2026-07-14) — real HTTP endpoint testing only.** Implemented
   `apps/api/app/services/runtime_api_audit_service.py` + `POST
   /meta-factory/{project_id}/runtime-audit`: actually starts the generated backend (real
   subprocess, real port, `.ldcn-venv`) and issues real GET requests against every parameter-free
   OpenAPI path, flagging any 5xx as a genuine runtime crash — the first execution-based check
   in this codebase (everything else remains static/regex). Scoped honestly to Python/FastAPI
   only (`report.supported=False` for every other language, never a false pass); GET-only, no
   request bodies synthesized. Still open: browser route rendering, onClick→API wiring, mobile
   OS permission checks, CVE/license scanning, and runtime coverage for Node/Java/Go/etc.
   backends.

Renaming states to match the spec's 5-phase vocabulary (GENERATING/ANALYZING/REPAIRING/
TESTING/CERTIFIED) would be cosmetic — the real gate (`_require_verified` / `VERIFIED`) already
does the job described by "golden rule."
