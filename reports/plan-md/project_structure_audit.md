# Project Structure Audit

Status: completed

Audit scope:
- Root directories, app directories, packages, templates, generated projects, reports, future placeholders, backend services/engines/routes, frontend components, contracts, and tests.
- Caches and generated dependency folders were excluded from active classification: `node_modules`, `.next`, `__pycache__`, `.pytest_cache`, and Playwright/Chrome profile caches.

Directory classification:
- ACTIVE: `apps/api`, `apps/web`, `packages/contracts`, `templates`, `reports`, `docs`, `generated-projects/active`.
- RESERVED: `apps/admin`, `apps/studio`, `apps/docs`, `packages/ui`, `packages/theme`, `packages/validation`, `packages/sdk`, `packages/config`, `packages/logger`, `packages/prompts`, `scripts`, `infrastructure/*`, `docs/*`, `future/*`.
- ARCHIVE: `generated-projects/archived`, historical report markdown files, local runtime log files, prepared ZIPs under `apps/api/app/data/prepared-downloads`.
- REMOVE_CANDIDATE: `tools`, `packages/events`, `apps/web/reports`, `infrastructure/ci`, `.pytest_cache`, `test-results`, repeated browser profile directories under `reports/cdp-*` and screenshot profile folders.

Findings:
- Root `agents/`, `engines/`, and `services/` contained only empty conceptual subdirectories. They were moved to `future/agents`, `future/engines`, and `future/services`.
- Active backend engines are in `apps/api/app/engines`.
- Active backend services are in `apps/api/app/services`.
- No active imports were found from root `agents`, root `engines`, root `services`, or root `infrastructure`.
- `agent.contract.ts` and `wizard.contract.ts` currently have no direct static consumers and are classified as RESERVED contracts.
- `packages/events` is outside the requested canonical package set and remains documented as REMOVE_CANDIDATE.
- `reports` contains many historical phase validation reports. They were not deleted or moved.
- `reports/cdp-*` and several `reports/screenshots/*` paths contain browser profile/cache directories rather than final PNG screenshots. They are cleanup candidates, not removed.

Import risk:
- No source imports broke during static search after moving root placeholders.
- Runtime validation is documented in the cleanup action report.

