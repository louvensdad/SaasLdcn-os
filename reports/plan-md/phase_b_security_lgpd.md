# Phase B - Security and LGPD

## Status

Validated on 2026-06-15.

## Delivered

- JWT access tokens with rotating refresh tokens.
- Refresh tokens delivered only through `HttpOnly`, `SameSite=Lax` cookies.
- Bcrypt password hashing with a compatible dependency pin.
- Authentication required on all non-public API routers.
- RBAC enforcement for shared Git credentials and repository delivery.
- Production-safe CORS defaults and mandatory production JWT secret.
- Structured rate limiting and security response headers.
- Explicit privacy-policy acceptance during registration.
- Profile access/correction, consent recording, personal-data export, account
  anonymization, and session revocation.
- Safe audit events included in the titular data export.
- Startup cleanup for expired refresh tokens and audit-log retention.
- Updated `docs/standards/lgpd-handling.md`.

## Validation

- Dedicated authentication, RBAC, headers, rate-limit, consent, export, and
  erasure tests are included in `apps/api/tests/test_auth_security_lgpd.py`.
- Full backend suite: 195 passed.
- Frontend production build and TypeScript checks passed.

## Residual risks

- Rate limiting is process-local; multi-instance production requires a shared
  store such as Redis.
- Git provider tokens remain in backend memory and are workspace-wide, so the
  feature is admin-only until encrypted per-user storage exists.
- Projects/generated artifacts are not yet associated with a `user_id`.
- In-app browser visual validation was blocked by the Windows sandbox ACL
  helper; build, typecheck, API tests, and HTTP smoke validation passed.
