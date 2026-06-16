# Repository Delivery Architecture

## Components

- `GitProviderService`: runtime credential custody, provider profile validation, repository creation, and provider transport.
- `GitExportEngine`: Gatekeeper, requirements, generated-project quality, security filtering, diagnostics, and export orchestration.
- GitHub adapter path: blobs, tree, root commit, branch reference.
- GitLab adapter path: project creation and repository commit actions.
- Shared TypeScript/Pydantic contracts keep tokens out of response shapes.

## Extension Points

The provider service boundary can add OAuth, branch creation, releases, project boards, issues, and CI/CD bootstrap without changing the Repository Delivery UI contract.

## Credential Lifecycle

V1 accepts provider tokens as temporary runtime credentials. They are not persisted, logged, echoed, or returned. Disconnect removes them from runtime memory.
