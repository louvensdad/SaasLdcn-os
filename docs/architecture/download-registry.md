# Download Registry

`GET /api/downloads` is an authenticated, owner-scoped audit catalog. It does not expose host filesystem paths.

A record is created whenever Local Generation, Meta-Factory, the generation job packager, or the deterministic `prepare_download` skill prepares a ZIP. Each record contains:

- `downloadId`, `projectId`, and optional `workspaceId`
- logical `artifactId` and relative `downloadUrl`
- SHA-256 checksum and byte size
- `prepared`, `downloaded`, or computed `expired` status
- creation, expiration, and first/latest download timestamps

Prepared archives expire after 24 hours. The download endpoint returns HTTP 410 after expiration or when no audited preparation exists. Repeated downloads remain allowed until expiration and update the audit timestamp.

The project owner is taken from the authenticated request. ZIP objects and project snapshots receive the same workspace identifier used by the registry. Catalog queries always filter by `owner_user_id`; no global list or physical `artifactPath` is returned.