# LDCN OS - Quality Gates

## 1. Purpose

This document defines the mandatory quality gates for LDCN OS.

These gates exist to prevent architectural drift, broken releases, hidden coupling, and uncontrolled growth. Every phase of development must pass the relevant gates before it can be approved.

No phase is complete if the system remains fragile, ambiguous, or incomplete.

## 2. Quality gate philosophy

The platform follows these non-negotiable principles:

- nothing moves forward broken
- no feature enters without tests
- no agent enters without a contract
- no wizard enters without validation
- no template enters without a blueprint
- no generation enters without registry and download support
- no UI enters without responsiveness

These rules are not optional. They are the default approval standard for all work in LDCN OS.

## 3. Global gates

Global gates apply across all phases and all modules.

### 3.1 Build gate

The project must build successfully in the expected environment.

Pass criteria:
- build completes without fatal errors
- build output is consistent with the current phase
- no unresolved compilation blockers remain

### 3.2 Typecheck gate

Type safety must be preserved across shared contracts and application layers.

Pass criteria:
- typecheck completes successfully
- contract mismatches are resolved
- no unsafe typing is introduced as a shortcut

### 3.3 Lint gate

Code and structured artifacts must follow platform conventions.

Pass criteria:
- lint passes
- style violations are fixed
- no ignored lint noise is allowed to accumulate

### 3.4 Test gate

Every phase must have tests that prove its behavior.

Pass criteria:
- required tests exist
- required tests pass
- regressions are not tolerated

### 3.5 Navigation gate

Frontend navigation must be functional and predictable.

Pass criteria:
- routes resolve correctly
- sidebar and primary navigation work
- users can reach intended sections without dead ends

### 3.6 Responsive gate

UI must behave acceptably across target form factors.

Pass criteria:
- desktop works
- tablet adaptation is stable
- mobile minimal mode is usable

### 3.7 Accessibility gate

The UI must remain usable and legible for a broad set of users.

Pass criteria:
- contrast is acceptable
- focus states are visible
- keyboard navigation works where expected
- reduced motion is respected

### 3.8 Security gate

The platform must not expose unsafe behavior or sensitive data.

Pass criteria:
- secrets remain server-side
- no sensitive values leak into UI or logs
- access boundaries are preserved

### 3.9 Architecture gate

The system must stay within its layered boundaries.

Pass criteria:
- no circular dependencies
- no layer violations
- no hidden architecture bypasses

### 3.10 Contract gate

All communication must use the shared contract model.

Pass criteria:
- contracts are consistent across modules
- no duplicated schema drift
- IDs and payloads are standardized

### 3.11 Performance gate

Performance must remain acceptable for the current phase.

Pass criteria:
- no major regressions
- critical flows remain responsive
- expensive operations are intentional and observable

## 4. Architecture gate

The architecture gate validates that the system remains modular and controlled.

It must confirm:
- no circular dependencies
- no access outside the assigned layer
- no giant service that absorbs unrelated responsibility
- no duplicated business logic in multiple places
- no bypass of the orchestrator in governed flows
- no direct access that should be mediated by contracts or services

If any layer begins acting like a shortcut around the platform, the architecture gate fails.

## 5. Frontend gate

The frontend gate ensures the UI is functional, responsive, and aligned with the design system.

It must validate:
- routes work
- sidebar works
- buttons respond
- no layer blocks user clicks
- layout is responsive
- loading, error, and empty states exist
- no generic or amateur-looking UI is introduced
- the design system is followed

If the interface looks good but behaves poorly, the gate fails.
If the interface behaves well but feels inconsistent or unfinished, the gate fails.

## 6. Backend gate

The backend gate ensures the API layer is safe, explicit, and reliable.

It must validate:
- `/api/health` works
- Pydantic schemas are valid
- HTTP errors are correct and intentional
- logs are useful for debugging and auditing
- no HTTP 200 is used to hide failures
- secrets are never exposed
- endpoints are documented

The backend must fail loudly when something is wrong. Silent failure is not acceptable.

## 7. Contract gate

The contract gate ensures that all modules speak the same language.

It must validate:
- `stack_id` is standardized
- `project_id` is present where required
- wizard payload is correct
- generation response is correct
- download contract is correct
- frontend and backend use the same contracts

If the contract layer drifts, the system becomes untrustworthy. This gate prevents that.

## 8. Agent gate

The agent gate ensures agents remain scoped, safe, and testable.

It must validate:
- each agent has clear input and output
- each agent has a single responsibility
- agents do not access the filesystem directly
- agents do not act without the orchestrator
- agents return clear errors when blocked
- each agent has a dedicated test

Agents are not allowed to behave like opaque magic. They must remain accountable.

## 9. Prompt Master gate

The prompt master gate ensures prompt assets are technically precise and complete.

It must validate that the prompt includes:
- stack
- architecture
- modules
- business rules
- required files
- forbidden files
- security constraints
- tests
- documentation requirements

If the prompt omits critical structure, it is not ready for production use.

## 10. Generation gate

The generation gate ensures that generated output is complete and traceable.

It must validate:
- the generated project exists
- required files exist
- the correct stack was generated
- prohibited technologies are not present
- `README` exists
- docs exist
- `generation_trace` exists
- `validation_report` exists

Generation is only valid if the output can be inspected, verified, and traced.

## 11. Download gate

The download gate ensures artifact delivery is safe and scoped.

It must validate:
- `project_path` exists
- the path stays inside `generated_projects`
- the ZIP contains only the project
- the ZIP does not include secrets
- the ZIP does not download the LDCN OS root
- errors are clear when packaging fails

If a download can escape its project boundary, the gate fails immediately.

## 12. Template gate

The template gate ensures templates are real, complete, and usable.

It must validate:
- the template has an `id`
- preview exists
- blueprint exists
- `default_answers` exist
- prompt seed exists
- `stack_id` is valid
- using the template works
- generating from the template works

Templates are not static decoration. They must drive real generation behavior.

## 13. LDCN gate

The LDCN gate ensures the core copilot experience is stable and safe.

It must validate:
- conversation keeps context
- the system does not enter loops
- actions are safe
- voice does not listen to its own output
- avatar does not block the UI
- fallback behavior is clear

This gate protects the intelligence layer from becoming noisy, unstable, or intrusive.

## 14. Security gate

The security gate protects the platform from exposing sensitive material or unsafe execution paths.

It must validate:
- secrets exist only in backend-controlled storage
- API keys never appear in frontend code
- `.env.example` is allowed
- real secrets are blocked
- downloads are secure
- logs do not leak keys

Security failures are release blockers.

## 15. Approval rule

For every phase:

- generate a report
- list tests executed
- list fixed errors
- list open pending items
- approve only if all required gates pass

If even one mandatory gate fails, the phase remains open.

## 16. Required reports

The following reports are mandatory artifacts of the quality process:

- `reports/phase_validation.md`
- `reports/build_validation.md`
- `reports/security_validation.md`
- `reports/architecture_validation.md`
- `reports/final_100_percent_validation.md`

These reports must be produced whenever the corresponding validation is performed.

## 17. Reporting standards

Each report must state:
- what was tested
- what passed
- what failed
- what was fixed
- what remains open
- whether the phase is approved

Reports must be written clearly enough for engineering, product, and governance review.

## 18. Final rule

Quality gates are not ceremonial. They are the mechanism that keeps LDCN OS disciplined, enterprise-safe, and structurally coherent.

If a change makes the system faster but less safe, less testable, less consistent, or less understandable, it does not pass.
## 15. Executable CI profiles

The repository enforces the following profiles in `.github/workflows/quality-gates.yml`:

- backend: locked dependencies, Alembic drift check, 87% minimum coverage, and runtime dependency audit
- frontend: lint warning budget, i18n/locale/typography gates, hotspot budgets, strict TypeScript, bundle budgets, and high-severity npm audit
- security-adversarial: sandbox, terminal, artifact ingestion, secret redaction, and hostile ZIP/URL cases
- infrastructure-contracts: ephemeral PostgreSQL, Redis, and MinIO round trips
- e2e-smoke: delivery contract and Axe WCAG serious/critical scan
- containers and secret-scan: reproducible images and repository secret detection

`integration`, `contract`, `security`, `slow`, and `enterprise` pytest markers define explicit execution profiles. The default local suite excludes integration and long-running profiles.

Current controlled baselines are regression ceilings, not quality targets: 39 ESLint warnings, 195 hardcoded i18n findings, and 318 missing keys in each non-reference locale. Any increase fails CI; reductions are accepted. `skipLibCheck` remains enabled because the current Three.js postprocessing declarations fail independently of application code. `allowJs` is disabled.

Frontend production builds fail above 1,650,000 raw route chunk bytes or 4,600,000 total static chunk bytes. Backend coverage fails below 87% (measured baseline: 88%).
