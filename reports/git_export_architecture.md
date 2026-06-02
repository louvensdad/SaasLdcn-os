# Git Export Architecture

## Scope

Phase A defines contracts and governance for future export of already generated projects to GitHub or GitLab. It does not create repositories or push commits.

## Contract

The canonical TypeScript contract is `packages/contracts/git-export.contract.ts`.

Required request fields:

- `provider`: `github` or `gitlab`
- `repo_name`
- `visibility`: `private` or `public`
- `branch`
- `commit_message`
- `project_id`

Authentication is represented by `credential_reference`, not a raw token. A future credential session should store OAuth or temporary token material outside logs, traces, generated files, and ZIPs.

## Foundation endpoints

- `POST /api/git/export/github`
- `POST /api/git/export/gitlab`
- `GET /api/git/export/status/{export_id}`

Both POST endpoints must reject projects without `generated_project_path`. Export status must include security validation, files included, status, failure reason, and repo URL after success.

## Required gate sequence

1. Load project record.
2. Verify project status is `generated`.
3. Resolve generated project root inside the workspace.
4. Run generated file safety scan.
5. Run or reuse Gatekeeper security validation.
6. Exclude blocked files.
7. Export only safe files.

## Frontend targets

Project Detail -> Export to Git should show:

- security validation result
- files included
- export status
- repo URL after success

## Non-goals in Phase A

- No GitHub/GitLab API calls.
- No token entry UI.
- No OAuth flow.
- No repository mutation.
