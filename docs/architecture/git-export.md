# Git Export

## Status

Git Export is implemented and authenticated. GitHub and GitLab credentials are owned by the current user, stored as encrypted expiring sessions, and are never included in export jobs or responses.

## Endpoints

- `GET /api/integrations/git/{provider}`: connection status.
- `POST /api/integrations/git/{provider}/connect`: store an encrypted GitHub or GitLab token.
- `POST /api/integrations/git/{provider}/validate`: validate the active connection.
- `DELETE /api/integrations/git/{provider}`: remove the connection.
- `POST /api/repositories`: create and deliver a repository with the connected provider.
- `POST /api/git/export/preview`: validate and preview an export.
- `POST /api/git/export/github` and `/gitlab`: execute an export.
- `GET /api/git/export/status/{export_id}`: owner-scoped status.

## Security contract

- Export only an owned project with a generated project path.
- Run security validation before delivery.
- Reject `.env`, secrets, credentials, private keys, and secret-like generated content.
- Keep provider tokens out of contracts, traces, logs, artifacts, and responses.
- Return repository URLs only after successful provider delivery.
- Status lookup is scoped to the authenticated owner.

The API schemas under `apps/api/app/schemas` are the runtime source of truth; shared UI contracts live under `packages/contracts`.