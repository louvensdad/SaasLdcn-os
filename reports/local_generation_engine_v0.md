# Local Generation Engine V0

Date: 2026-05-28

## Scope

Implemented deterministic local generation for static foundations only.

Supported V0 templates:

- `landing-page`: Next.js static landing
- `portfolio`: React portfolio
- `docs-site`: documentation static site
- `static-site`: vanilla static site

Explicitly blocked:

- microservices
- event-driven systems
- distributed systems
- queues
- websocket/realtime infrastructure
- Kubernetes/Docker orchestration paths
- AI/RAG capabilities

## Backend

- Added `POST /api/generation/local-run`.
- Added `LocalGenerationEngine`.
- Added `TemplateRenderService`.
- Added local generation schemas.
- Added local generation contract.
- Added filesystem-safe rendering with path traversal checks and no overwrite behavior.

No npm install, Docker, shell execution, git clone, external downloads, AI, LLM, autonomous agents, or internet access are used by the engine.

## Frontend

- Added `useLocalGeneration`.
- Added Project Detail local generation section.
- Added output path field, `Generate Locally` action, progress state, artifacts, file tree, trace, path surface, and safe failure rendering.
- LDCN Presence reflects local initialization, template assembly, filesystem snapshot, and unsupported-architecture blocks.
