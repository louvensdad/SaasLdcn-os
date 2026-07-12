# Local Generation Runtime Validation

Date: 2026-05-28

## Commands

- `pytest apps/api/tests/test_local_generation.py`: 6 passed
- `pytest apps/api/tests`: 110 passed
- `npm run typecheck`: passed
- `npx tsc --noEmit`: passed
- `npm run build`: passed
- `npx playwright test tests/local-generation.spec.ts`: 4 passed

## Notes

The Next dev server was restarted before the Playwright run because the prior dev process had stale `.next` chunks after a production build.

Pytest emitted cache permission warnings for `.pytest_cache`; all tests passed.

Local inspection URL:

- `http://localhost:3000`
