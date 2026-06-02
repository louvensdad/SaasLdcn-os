# Language Domain Runtime Validation

Validation completed against the current workspace code.

## Backend

- `python -m pytest apps/api/tests` -> passed
- `python -m pytest apps/api/tests/test_language_domains.py apps/api/tests/test_registry.py` -> passed
- `python -m pytest apps/api/tests/test_api.py` -> passed

## Web

- `npm run typecheck` -> passed
- `npm run build` -> passed

## Playwright

- `npx playwright test tests/language-domain.spec.ts --reporter=line` -> passed

## Runtime checks

- `http://127.0.0.1:8001/api/languages/java/profile` -> `200`
- `http://127.0.0.1:3000/wizard` -> `200`

## Notes

- The local 3000/8001 listeners were restarted so the browser suite hit the updated code, not a stale process.
- No generation, AI, voice, avatar, or real agents were introduced.

