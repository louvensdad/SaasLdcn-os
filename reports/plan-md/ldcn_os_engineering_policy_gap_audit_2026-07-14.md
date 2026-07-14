# LDCN OS Engineering Policy v1.0 — Gap Audit (2026-07-14)

Compares the "LDCN OS — Engineering Policy" document (broader/later version of the
"Production Guarantee Engine" spec already audited in
`production_guarantee_engine_gap_audit_2026-07-14.md`) against the real codebase. Sections
already covered by that report are summarized briefly here with a pointer; this report's
detail is on what's genuinely NEW in this version.

## Carried over from the first audit (see that report for detail)

- **Truth First** → `ground_truth_engine.py` + `execution_reality_guard.py`. Real, strong.
- **Functional First / Build Guarantee / Final Certification** → Functional Completeness
  Gate + `_require_verified()`. Real in spirit; no single `CERTIFIED` state (see below).
- **QA Loop (Backend/Frontend/Mobile/Security/Dependency/Runtime Auditor)** → mostly
  static/regex heuristics; **Runtime Auditor is now real for Python/FastAPI**
  ([[runtime-api-audit-engine]], this session).
- **Project Memory** → **closed this session** ([[project-memory-engine]]).
- **Repair Loop → Generator Agent** → **closed for the Quality Gate loop this session**
  ([[llm-repair-engine]]).
- **Context Economy** → real (`context_pack_builder.py`), role-scoped not error-scoped.
- **Engineering Terminal** → real (`execution_terminal_service.py`, streamed via SSE).

## New in this version

### 1. Technology Governance — NOT IMPLEMENTED

The policy demands multiple **version** options per language/framework (e.g. "Java 25 LTS
(recomendado), Java 21 LTS, Java 17") with explicit user choice, never a silent old default.

Reality: `SuggestedStack` (`orchestrator.py:29-36`) has no version field at all.
`DEFAULT_ANCHORS` (`stack_compatibility.py:45-49`) hardcodes exactly one version per package
(React `^18.2.0`, RN `0.74.5`, Expo `~51.0.0`) with no menu. The real Stack Approval Gate
(`StackProposalItem.alternatives`, `architecture_blueprint.py:60-68`) does let a user pick
between **framework names** (e.g. Vue vs. React) — but never between **versions** of the
chosen framework. Zero matches anywhere for version-menu-style UI text.

### 2. Token Intelligence / LLM Escalation — PARTIAL

Policy wants regex → deterministic → small → medium → large LLM, always cheapest first, plus
a cache consulted before any LLM call.

Reality: `LLMRouter`/`model_registry.py` picks a **fixed** role→model table once
(`ROLE_MODEL_HINTS`, e.g. backend/frontend/repair always Opus, docs always Haiku) — no
complexity-based retry ladder. No app-level LLM response cache exists (only Anthropic
provider-side prompt-prefix caching, a cost optimization, not a call-skipping cache). Real,
but narrow: specific pipeline steps (`DATABASE_GENERATING`, stage fallback) do skip the LLM
via a deterministic engine — this is a per-step exception, not a universal pre-LLM gate.

### 3. Documentation Auditor — PARTIAL, narrower than the policy

Policy wants doc-content claims cross-checked against real files ("mentions docker-compose →
must exist; mentions an endpoint → must exist").

Reality: `documentation_engine._scan_consistency()` + `functional_completeness_engine.
_readme_truth_guard()` do real content-vs-project checks — but only for **3 hardcoded
signals**: docker mentioned without a Dockerfile/compose file, postgres mentioned without
Postgres config, JWT/bearer mentioned without auth code. Raises a real BLOCKER
(`readme_truth_*`). No check parses README prose for a specific **endpoint name** and
verifies it against `openapi.yaml`/route code — the policy's literal example ("mentions
endpoint → must exist") is not implemented.

### 4. UI/Mobile Coverage — narrower than the policy, no cross-reference graph

Policy wants List/Create/Edit/Details/**Delete** per endpoint, plus orphan-component,
nonexistent-hook, and broken-link detection.

Reality: `FrontendResourceCoverage` has exactly 6 fields (`listPage, createPage, editPage,
detailPage, apiClient, inMenu`) — **no delete field at all**. `MobileResourceCoverage` has
only 3 (`listScreen, detailScreen, apiClient`) — no create/edit/delete. All derived from
filename/text-substring regex, not an AST or reference graph — so orphan components,
nonexistent hooks, and broken nav→router links are **not implemented**.

`product-completion-report.json` (policy wants 10 percentage categories: Backend/Frontend/
Mobile/Security/Docs/Tests/UI-coverage/API-coverage/Build/Integrations) actually has **3**:
`backend_completeness, frontend_completeness, mobile_completeness` + a separate `ui_depth`
score. Security/Documentation/Tests/API-coverage/Build/Integrations percentages don't exist.

### 5. Import Graph — PARTIAL, JS/TS only

Real graph (nodes = files, edges = classified imports), real broken-import detection
(`unresolved_internal`) and real undeclared-npm-dependency detection — but explicitly JS/TS
only (`is_js_file` gate; the module's own docstring says Java/Python were deferred), **no
orphan-module (unreferenced file) detection**, and it's report-only/non-blocking by design
(never fails a job).

### 6. External APIs Governance — PARTIALLY CLOSED (2026-07-14)

Policy wants opt-in-only external integrations (Stripe/OpenAI/WhatsApp/Twilio/Firebase/
SendGrid/...) and, when used, mandatory contract+timeout+retry+fallback+circuit-breaker+docs+
tests+mocks.

Original finding: no structured integration fields anywhere in `orchestrator.py`/
`architecture_blueprint.py`/`blueprint_engine.py`; the backend system prompt never mentioned
any provider or asked for retry/timeout/circuit-breaker/mocks; the circuit-breaker/retry code
that existed (`llm/resilience.py`) only protected LDCN-OS's own LLM provider calls.

**Key discovery during research: a real, structured, opt-in provider catalog already
existed** — just disconnected from the pipeline that actually generates code. The Wizard's
Infrastructure Registry (`infrastructure_registry_service.py`, `schemas/infrastructure.py`)
already lets a user explicitly check a box for Stripe/SendGrid/Resend/Mercado Pago
(`apps/web/app/(app)/wizard/page.tsx`), and the selection already flows into
`blueprint["dependency_graph_snapshot"]["infrastructure_ids"]` — it just never reached
`ProjectSpec` (the Architect Engine pipeline `generation_job_engine.py` actually uses) or got
verified against generated code.

**Implemented:** `apps/api/app/engines/external_integration_audit_engine.py` — for each of
the 4 already-cataloged providers, checks whether its SDK is a manifest dependency; if so,
whether the provider was actually approved (`ldcn.project.json`'s new
`selected_infrastructure_ids` field, populated in `project_manifest_engine.py` from the
existing snapshot); an SDK present without approval is a real, deterministic BLOCKER
(`external_integration_not_opted_in:*`) — the opt-in enforcement genuinely didn't exist
before. For approved providers, WARNING-level checks for resilience keywords
(timeout/retry/circuit/backoff/fallback) near usage and test/mock coverage. Wired into
`quality_gate_engine.evaluate()` (runs even without a build). Also added explicit
integration-governance rules to `agent_prompts.py`'s `BACKEND_RULES` (closes "not even
prompt-level").

**Deliberate scope limit:** only the 4 providers the Wizard already catalogs (stripe,
sendgrid, resend, mercado_pago) — extending to Twilio/OpenAI/WhatsApp/Firebase requires first
adding them to `dependency_graph_engine.py`'s node catalog (nodes/edges/propagation/risk
scoring), a separate, larger piece of work not attempted here. Contract-level requirements
(explicit API contracts beyond "SDK is in the manifest") also not verified.

### 7. Engineering Kernel states — more fragmented than the first audit found

Policy wants one unified state machine: DRAFT, APPROVED, GENERATING, ANALYZING, REPAIRING,
TESTING, CERTIFIED, PARTIALLY_VERIFIED, BLOCKED.

Reality, checked as exact literals across the whole schema layer (not just the 3 files the
first audit checked): `DRAFT` and `GENERATING` exist literally in `ProjectRoomStatus`
(`project_room.py:14,24`); `APPROVED` exists literally in `StackApproval.status`
(`architecture_blueprint.py:48,72`) — a **different, unrelated** status vocabulary from the
Kernel. `BLOCKED`/`PARTIALLY_VERIFIED` are real in `CompletenessStatus`. **`ANALYZING`,
`REPAIRING`, `CERTIFIED`, and standalone `TESTING` exist nowhere as literal values** — not
even as substrings outside `TESTS_GENERATING`/`TESTS_RUNNING`. The policy's single 9-state
Kernel does not exist as one type anywhere; it's scattered across three unrelated status
enums (`ProjectRoomStatus`, `StackApproval.status`, `CompletenessStatus`/
`GenerationJobStatus`'s 27 states).

### 8. Dependency Governance — mixed, one important correction

| Check | Verdict |
|---|---|
| Peer dependencies | Real (`stack_compatibility.py` `PeerConflict`/npm ERESOLVE parsing) |
| Supported versions | Real, but a curated matrix (React 18/19 only), not live |
| Version conflicts | Real (`check_duplicate_versions`) |
| CVE/vulnerabilities | **CLOSED (2026-07-14).** `dependency_research_service.vulnerabilities_for()` now queries OSV.dev (real GHSA/CVE data) for every dependency's requested version, across all 8 ecosystems. New `"vulnerable"` status feeds `quality_gate_engine` (CRITICAL/HIGH → BLOCKER) and, for free, [[llm-repair-engine]]'s repair loop. See memory `cve-scanning-engine`. Remaining gap: only direct manifest-declared versions are checked, not lockfile-resolved transitive dependencies. |
| Nonexistent (404) packages | **Curated-list-based, not proactive.** `dependency_registry.py`'s pre-install gate only blocks one hardcoded `KNOWN_BAD_PACKAGES` entry + a Radix allowlist — it cannot catch an invented package outside that scope. Real npm-registry 404 handling exists, but only **reactively**, after `npm install` already fails (`build_validation_service.py:488`), not as a pre-generation check. |

---

## Ranked, actionable gaps (new in this document)

1. **CLOSED (2026-07-14).** CVE/vulnerability scanning — was zero coverage. Implemented via
   OSV.dev (not `npm audit`, which is npm-only and needs a lockfile — OSV covers all 8
   ecosystems from manifest text alone). See memory `cve-scanning-engine`.
2. **External APIs governance** — complete gap, not even prompt-level; real risk since
   nothing stops a generated project from silently depending on Stripe/Twilio/etc. without
   retry/timeout/circuit-breaker.
3. **Unified Engineering Kernel state machine** — cosmetic but real: three unrelated status
   enums where the policy wants one. Renaming/consolidating is low-risk, high-clarity.
4. **Delete-page coverage + `product-completion-report.json`'s missing 6 categories** —
   moderate effort, extends an engine that already exists (`functional_completeness_engine.py`)
   rather than building new infrastructure.
5. **Technology Governance (version choice)** — real UX gap but lower urgency; requires
   frontend work (a version-picker UI) in addition to backend.
6. **Documentation Auditor's endpoint-prose check** — narrow, well-scoped extension of an
   existing real engine (`_scan_consistency`).
7. **Token Intelligence complexity ladder + LLM cache** — real optimization opportunity but
   not a correctness/safety gap; lowest urgency of the list.
