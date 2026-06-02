# Git Export Contract

Contract file: `packages/contracts/git-export.contract.ts`

## Status

Planned and inactive in V1 Foundation.

## Key points

- Supports future `github` and `gitlab` providers.
- Requires `repo_name`, `visibility`, `branch`, `commit_message`, and `project_id`.
- Uses `pending`, `validating`, `exporting`, `success`, `failed`, and `blocked`.
- Requires security validation metadata.
- Uses credential references instead of raw tokens.

## Placeholder endpoint

- `GET /api/git/export/status/{export_id}`
