# LDCN OS - P1 Remediation Report

**Date:** 2026-07-14  
**Scope:** only P1 findings from `reports/full_system_audit.md` (AUD-002 through AUD-013). P2/P3 were not implemented.

## Status

| Finding | Status | Evidence |
| --- | --- | --- |
| AUD-002 Git/ZIP SSRF and resource abuse | Remediated | HTTPS Git host allowlist, URL/credential/port/query rejection, sandbox clone, ZIP manifest quotas for entries/bytes/depth/name/ratio/time, reduced global limits, tests. |
| AUD-003 Reproducible production and CI | Remediated for P1 | API/web/sandbox Docker images, non-root users, healthchecks, CI for migrations, backend, lint/type/build, SCA, E2E, secret scan and image builds. Deployment/rollback/backup runbook added. |
| AUD-004 SQLAlchemy/migration drift | Remediated for new databases | BlueprintApproval FK aligned; lease/token migration added. Fresh isolated SQLite passes `upgrade head` and `alembic check`. Legacy local SQLite still reports historical type/index drift and requires a separately reviewed data migration. |
| AUD-005 Orphaned/non-durable jobs | Remediated | CAS leases, attempt IDs, heartbeat/expiry, non-daemon workers, startup reconciliation, resume and guaranteed lease release. |
| AUD-006 No token budget | Remediated | Atomic per-job/per-owner daily reservation and settlement before provider dispatch; configurable budgets; persisted totals and tests. |
| AUD-007 E2E can touch developer DB | Remediated | Random namespaced E2E database, migrations before startup, cleanup on shutdown, no server reuse, portable launcher and CI smoke. |
| AUD-008 Secrets in generated artifacts | Remediated for new writes | Central artifact policy blocks real `.env`, credential/private-key files and high-confidence secrets in local/S3 paths. Modernize sanitizes legacy assignments before materialization. No generated artifacts or `.env` files are tracked in Git. |
| AUD-009 Production hardening | Remediated | Independent minimum-length JWT/encryption/metrics secrets, HTTPS URLs/origins, trusted hosts, configured public OAuth callback base, distributed-service validation and tests. |
| AUD-010 Missing production observability | Remediated for P1 baseline | Authenticated production metrics, request latency/count, generation token and sandbox result counters, `X-Request-Id`, SLOs, alerts and operational runbooks. Full distributed tracing remains a future observability evolution, not a host-execution bypass. |
| AUD-011 Contradictory mobile support | Remediated | Public spec and Architect are Expo/React Native only. Flutter is rejected before generation and remains an explicit future alternative. |
| AUD-012 Documentation drift | Remediated | BYOK, Git Export, quickstart URLs, secret handling, ledger, production deployment and monitoring docs reconciled with runtime. PDF remains the documented placeholder. |
| AUD-013 Mojibake | Remediated in runtime/UI sources | Corrupted source strings repaired, UTF-8 editor/Git policy added, automated regression scan covers backend runtime and frontend app/components/lib. |

## Runtime and security controls

- Production allows only `SandboxExecutionRuntime`; host execution requires explicit local-development double opt-in.
- Terminal, builds, tests, analysis, Modernize, Meta-Factory, Auto-Fix and Laboratory use the shared runtime boundary.
- Sandbox execution uses per-job containers, non-root UID, read-only root, dropped capabilities, no-new-privileges, PIDs/CPU/RAM/disk/file/time/output limits and deny-by-default network.
- Execution evidence records sanitized identity, command, runtime image, timing, status, exit/failure, resource data and changed files.
- Secrets are not injected automatically and are redacted from evidence, output, SSE, errors and artifacts.

## Verification

- Backend CI profile: **1019 passed, 1 skipped, 1 deselected**.
- Focused P1 security/metrics/sandbox/leases: **38 passed**.
- Expo-only, metrics auth and encoding regressions: **28 passed**.
- Modernize/artifact sanitization: **27 passed**.
- Playwright isolated smoke: **6 passed**.
- Frontend typecheck: passed.
- Frontend lint: passed with the existing 61-warning P2 baseline; no errors.
- Frontend production image/build: passed.
- API, web and sandbox images: built; all default to non-root users and API/web include healthchecks.
- Fresh database migration: `alembic upgrade head` and `alembic check` passed.
- Python SCA (`pip-audit`): passed with no known vulnerabilities.
- npm SCA at `high`: passed; two moderate PostCSS findings remain under AUD-016/P2 because npm proposes a breaking Next downgrade.

## Explicitly deferred

P2/P3 findings remain out of scope, including frontend warning cleanup, dependency/lock modernization, bundle budgets, LLM cache redesign, coverage expansion, hotspot refactors and legacy/dead API removal.