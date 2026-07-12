# Git Provider Self-Service

## Delivered

- Settings > Integrations contains dedicated GitHub and GitLab connection cards.
- Connections validate the provider identity, namespaces, repository/project count, scopes, permission, and last sync.
- Repository Delivery supports provider, namespace, repository, branch, visibility, repository creation, initial commit, push, and final URL.
- ZIP remains available as fallback delivery.

## Security

- Tokens enter only through the connection request.
- Tokens are runtime-only, never included in response models, and removed on disconnect.
- Request logging records method, path, status, and duration only.
- Generated files pass the existing secret-file and secret-content filters before export.

## Scope Boundary

OAuth, branches beyond the initial branch, releases, boards, issues, and CI/CD bootstrap remain future provider adapter capabilities.
