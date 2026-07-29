# Production Deployment

## Supported topology

Production runs separate non-root API and web images plus sandbox worker/runtime images. PostgreSQL, Redis, and S3-compatible artifact storage are mandatory shared services. Generated code executes only through `SandboxExecutionRuntime`; `ALLOW_HOST_EXECUTION` must remain `false`.

## Release gate

1. CI must pass backend tests, Alembic upgrade/check, frontend lint/typecheck/build, isolated E2E smoke, SCA, secret scan, and all container builds.
2. Build immutable images and record their digests.
3. Back up PostgreSQL and verify the latest S3 recovery point.
4. Run `python -m alembic upgrade head` as a controlled one-shot step before API rollout.
5. Deploy API/web with production configuration and verify `/api/health` plus authenticated `/api/metrics`.
6. Reconcile generation leases and watch error/latency/sandbox alerts during the rollout window.

## Rollback

Application images may roll back to the prior digest only when the database migration is backward compatible. If it is not, stop traffic and use the migration-specific downgrade/recovery procedure reviewed for that release; never improvise a destructive database downgrade. Preserve execution evidence and artifact versions across application rollback.

## Required production configuration

Use HTTPS URLs/origins, explicit trusted hosts, distinct JWT and encryption keys, a dedicated metrics bearer token, PostgreSQL, Redis, S3, and the sandbox egress proxy/network. Secrets come from the deployment secret manager and are never baked into images or committed environment files.

## Backup and restore

- PostgreSQL: automated encrypted backups with point-in-time recovery and quarterly restore tests.
- S3 artifacts: versioning/retention according to tenant policy plus checksum verification.
- Redis: treated as operational state; restore only when the managed-service policy requires it, then reconcile leases and sessions.
- Record restore-test date, recovery point, duration, and validation result.