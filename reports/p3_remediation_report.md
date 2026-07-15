# LDCN OS - P3 Remediation Report

Date: 2026-07-15
Scope: AUD-020.

## Result

The dead global downloads surface was replaced by a durable, authenticated, owner-scoped registry connected to every ZIP preparation path.

## Changes

- Added `download_records` migration/model with owner, workspace, logical artifact ID, URL, SHA-256, size, lifecycle timestamps, and status.
- Replaced the static `DOWNLOADS = []` repository with persistent owner-filtered queries.
- Connected Local Generation, Meta-Factory, generation job packaging, and the deterministic download skill.
- Applied workspace scoping to prepared object storage.
- Removed physical `artifactPath` from the API/frontend contract.
- Enforced 24-hour expiration with HTTP 410 after expiry or without a preparation record.
- Preserved repeated download access until expiry while recording consumption.
- Extracted archive coordination into `DownloadService`; hotspot budgets remain passing.

## Contract

`GET /api/downloads` returns only records owned by the authenticated user. Fields include `downloadId`, `projectId`, `workspaceId`, `status`, `artifactId`, `checksumSha256`, `sizeBytes`, `createdAt`, `expiresAt`, `downloadedAt`, and `downloadUrl`.

## Evidence

- Alembic upgrade from an empty database reached `20260715_j1_download_records`.
- `alembic check`: no new upgrade operations detected.
- Registry/API/OpenAPI contract tests: 6 passed.
- Local generation and registry lifecycle tests: 21 passed.
- Pipeline policy/job compatibility tests: 85 passed.
- Full backend suite: 1,029 passed, 1 skipped, 4 deselected, 12 warnings in 10m02s.
- TypeScript: passed.
- ESLint: 0 errors, 39 warnings within baseline.
- Hotspot budget: generation job engine 1,674/1,682; Meta-Fábrica route 1,475/1,475.