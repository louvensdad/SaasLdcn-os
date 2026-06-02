# Git Export

## V1 Foundation stance

Git Export is planned but inactive. V1 Foundation does not integrate with GitHub, GitLab, OAuth, personal access tokens, repository creation, or git push.

Placeholder endpoint responses return `501 Not Implemented` with:

`Feature planned but not active in V1 Foundation.`

## Contract

The canonical contract is `packages/contracts/git-export.contract.ts`.

Future request fields:

- `provider`
- `repo_name`
- `visibility`
- `branch`
- `commit_message`
- `project_id`

Future statuses:

- `pending`
- `validating`
- `exporting`
- `success`
- `failed`
- `blocked`

## Security rules

- Export only projects that already have a generated project path.
- Run Security Gate before export.
- Never export `.env`, real secrets, provider tokens, private keys, credentials, or secret-like generated content.
- Use credential references, not raw Git tokens, in export contracts and traces.
- Return repo URL only after successful export.

## Placeholder endpoint

- `GET /api/git/export/status/{export_id}`

The endpoint currently returns `501`.
