# Phase A - Frontend / Backend Closure

## Status

Validated on 2026-06-15.

## Delivered

- Added an OpenAPI contract gate covering all 116 operations consumed by
  `apps/web/lib/api/client.ts` and `apps/web/lib/api/meta-factory.ts`.
- Confirmed the active frontend does not depend on the planned `501`
  PDF-contract or User Key Boost endpoints.
- Kept those secure-extension placeholders explicitly inactive.
- Connected the meta-factory client to the shared bearer session.
- Replaced direct protected download links with authenticated Blob downloads.
- Added login, registration, session bootstrap, automatic access-token refresh,
  and protected-route redirection.
- Restricted workspace-wide Git provider/export operations to administrators
  and removed dead controls for regular users.

## Validation

- `python -m pytest -q`: 195 passed.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- Local HTTP smoke: registration, consent record, protected projects request,
  and cookie-based token refresh passed.

## Known planned gaps

- PDF Contract Input and User Key Boost remain `501 Not Implemented` by policy.
- Project records remain workspace-scoped rather than user-owned.
