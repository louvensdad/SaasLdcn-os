# Settings Phase 2 — Git Core Operations

Status: GitHub/GitLab backend foundation implemented; external provider validation pending credentials.

- Existing encrypted per-user connections, validation, disconnect, create repository and initial push were retained.
- Added real paginated `GET /api/repositories?provider=github|gitlab&page=&per_page=` using provider APIs.
- Added repository summary DTO with provider id, namespace, visibility, default branch, URL and last sync.
- Both supported providers are explicitly typed; Bitbucket, Azure DevOps and Gitea remain unsupported and are not simulated.
- Provider tokens are never returned by API or Activity Feed metadata.
- Remaining: Settings UI repository management and live provider contract tests require real GitHub/GitLab credentials or a controlled provider sandbox.