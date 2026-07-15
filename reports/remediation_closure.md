# LDCN OS - Remediation Closure

Date: 2026-07-15
Source audit: `reports/full_system_audit.md`
Scope: AUD-001 through AUD-020.

## Decision

The audited remediation program is implemented across P0-P3. Functional, container, and secret-history gates pass after the authorized credential rotation and history rewrite. Production promotion remains conditional on the GitHub Actions workflow succeeding and on operators supplying the production secrets and sandbox infrastructure described in the runbooks.

This closure does not claim that controlled debt is eliminated. Existing locale gaps, lint warnings, large hotspots, the upstream Next/PostCSS advisory, `skipLibCheck`, legacy database drift, and distributed tracing remain explicit follow-up items with regression gates or operational constraints.

## Traceability

| Finding | State | Primary evidence |
|---|---|---|
| AUD-001 host execution | Remediated | `ExecutionRuntime`, ephemeral Docker sandbox, host execution disabled by default, terminal/build/analyzer migration, hostile runtime tests. |
| AUD-002 Git/ZIP SSRF/resources | Remediated | Git allowlist and URL rejection, sandbox clone, ZIP entry/ratio/depth/size/time quotas, security tests. |
| AUD-003 reproducible production/CI | Remediated baseline | Locked installs, API/web/sandbox images, seven CI jobs, deployment and rollback runbooks. |
| AUD-004 migration drift | Remediated for new databases | Fresh `upgrade head` and `alembic check` pass through download registry migration. Historical local databases still require reviewed data migration. |
| AUD-005 orphaned jobs | Remediated | Durable leases, CAS acquisition, heartbeat, reconciliation, attempt metadata and tests. |
| AUD-006 token/cost budgets | Remediated | Per-job and per-owner reservations, settlement, daily caps, persisted totals and metrics. |
| AUD-007 E2E database pollution | Remediated | Per-run SQLite namespace, migrations, cleanup and no server reuse. |
| AUD-008 artifact/secrets governance | Remediated for new writes | Central artifact policy, redaction, S3/local enforcement; zero tracked generated projects and zero tracked non-example `.env` files. |
| AUD-009 production hardening | Remediated | Independent secrets, HTTPS/host/origin validation, trusted hosts and explicit OAuth callback base. |
| AUD-010 observability | Remediated baseline | Authenticated metrics, request/job/sandbox/token telemetry, SLOs, alerts and runbooks. Distributed tracing remains future work. |
| AUD-011 mobile contract | Remediated | Expo/React Native is the supported contract; Flutter is rejected before generation. |
| AUD-012 documentation drift | Remediated | BYOK, Git export, deployment, monitoring, quickstart and ledger aligned. |
| AUD-013 mojibake | Remediated with gate | Runtime/UI strings repaired and UTF-8 regression scan added. |
| AUD-014 frontend quality | Controlled and gated | Zero typography violations, Axe smoke, 39-warning ceiling, 195-hardcode ceiling and locale parity ceiling. Existing translation debt remains. |
| AUD-015 hotspots | Partially reduced and gated | Pipeline/usage policies extracted; seven exact line-count budgets prevent growth. Large modules remain scheduled debt. |
| AUD-016 dependencies/SCA | Remediated with upstream exception | Python hash locks and clean pip-audit; aligned Next/ESLint. Two moderate PostCSS findings remain inside Next without a supported non-breaking fix. |
| AUD-017 LLM cache | Remediated | Locking, byte/entry budgets, TTL, namespaced policy keys, metrics and concurrency tests. |
| AUD-018 test evidence | Remediated baseline | 87% coverage gate, 88% measured, explicit profiles, infrastructure contracts, adversarial job and E2E/Axe gates. |
| AUD-019 frontend build | Controlled and gated | `allowJs=false`, route/static bundle budgets and dynamic 3D boundaries. `skipLibCheck` remains for upstream declarations. |
| AUD-020 dead downloads API | Remediated | Durable owner-scoped registry with workspace, checksum, expiry, consumption audit and no host path exposure. |

## Final evidence

- Backend full suite: 1,029 passed, 1 skipped, 4 profile-deselected, 12 warnings in 10m02s.
- Backend measured coverage: 88%; CI floor: 87%.
- Fresh Alembic chain: upgrade through `20260715_j1_download_records`; no drift detected.
- Frontend production build: 27 static pages generated; route and static chunk budgets passed.
- Largest route chunks: wizard 1,491,661 bytes against 1,650,000 budget.
- Total static chunks: 4,105,637 bytes against 4,600,000 budget.
- TypeScript: passed with `allowJs=false`.
- ESLint: 0 errors; 39 warnings at the enforced ceiling.
- Typography: 0 violations.
- Axe login smoke: passed with no serious/critical findings.
- Python SCA: no known vulnerabilities.
- npm SCA: 0 high/critical; 2 moderate Next/PostCSS findings documented.
- Final container SCA: 0 fixable high/critical findings across API, web, and sandbox images.
- Full-history secret scan: 146 initial candidates remediated; fresh published-remote clone returned 0 findings across 66 commits.
- CI workflow parsed with jobs: backend, frontend, e2e-smoke, security-adversarial, infrastructure-contracts, containers and secret-scan.
- Repository hygiene: zero tracked generated projects and zero tracked non-example `.env` files.
- Process re-audit: process creation is confined to `ExecutionRuntime`; E2E launcher is development/test infrastructure.
- `git diff --check`: passed.

## Local promotion rehearsal

Docker image builds, seven E2E smokes, three real infrastructure contracts, and a real non-root/no-network sandbox execution passed locally. See `reports/release_rehearsal.md`.

## Promotion checklist

1. Triage all full-history gitleaks candidates, rotate every credential whose exposure cannot be ruled out, and obtain explicit approval before any history rewrite.
2. Run the GitHub Actions workflow on the target commit and require every job.
3. Build and sign/pin production container images in the approved registry.
4. Provision the sandbox Docker boundary and network proxy/allowlist; verify the Docker socket is unavailable to application containers.
5. Supply independent JWT, encryption and metrics secrets plus PostgreSQL, Redis and S3 endpoints.
6. Run migrations and backups against a production-like restore rehearsal.
7. Execute a tenant-isolation smoke and a hostile sandbox job in staging.
8. Review the known-debt list above before production sign-off; do not waive the P0 sandbox gate.