# Backend Generation Runtime Validation

Status: passed

Validation commands executed:
- `python -m pytest apps/api/tests` - 147 passed.
- `npm run typecheck` - passed.
- `npx tsc --noEmit` - passed.
- `npm run build` - passed.
- `npx playwright test` - 69 passed.

Runtime behavior covered by tests:
- FastAPI generation.
- Spring Boot generation.
- NestJS generation.
- Blocked generation.
- Invalid generation profile.
- Valid ZIP.
- Valid manifest and status lookup.
