# Project Cleanup Actions

Status: completed

Actions performed:
- Moved empty root conceptual placeholders:
  - `agents/` -> `future/agents/`
  - `engines/` -> `future/engines/`
  - `services/` -> `future/services/`
- Created canonical docs folders:
  - `docs/architecture`
  - `docs/roadmap`
  - `docs/standards`
  - `docs/agents`
  - `docs/api`
  - `docs/prompts`
  - `docs/ui-system`
- Created canonical generated-project buckets:
  - `generated-projects/active`
  - `generated-projects/archived`
  - `generated-projects/temp`
- Added README contracts to reserved/future folders and cleanup candidates.
- Updated default local generation paths in frontend/tests to use `generated-projects/active`, `generated-projects/archived`, and `generated-projects/temp`.

No deletion policy:
- No project source code was deleted.
- No generated project was deleted.
- No report was deleted.
- Empty placeholders were moved or documented, not silently removed.

Cleanup candidates left in place:
- `tools/`
- `packages/events/`
- `apps/web/reports/`
- `infrastructure/ci/`
- `.pytest_cache/`
- `test-results/`
- Browser profile/cache directories under `reports/cdp-*` and `reports/screenshots/*`.

Validation commands:
- `python -m pytest apps\api\tests` - passed, 118 tests.
- `npm run typecheck` - passed.
- `npx tsc --noEmit` - passed.
- `npm run build` - passed.

Validation notes:
- Pytest emitted cache permission warnings for `.pytest_cache`; this directory is already listed as REMOVE_CANDIDATE.
- No import breakage was found during validation.
