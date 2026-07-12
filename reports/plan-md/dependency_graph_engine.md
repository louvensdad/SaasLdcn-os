# Dependency Graph Engine Foundation

## Scope
- Added a dependency graph contract for nodes, edges, rules, propagation, impact, readiness, risk, mutations, and snapshots.
- Implemented the backend engine for graph build, propagation, impact, readiness, risk, conflict detection, and architecture mutation.
- Integrated the graph snapshot into the blueprint payload so downstream surfaces can reuse the computed state.

## Core rules
- `microservices` requires observability and promotes queue, API gateway, and containerized deployment patterns.
- `ai_chat` requires rate limiting and promotes websocket, vector database, and observability.
- `rag` requires a vector database and promotes queue, cache, and observability.
- `payments` increases security burden and promotes audit logs and observability.
- `spring_boot` favors modular monoliths before microservices.
- `nextjs` promotes SEO, analytics, and edge deployment.
- `fastapi` promotes async jobs and observability.

## Validation
- Backend unit tests passed for dependency propagation, readiness, risk, conflict warnings, and gatekeeper blocking behavior.
- Runtime preview endpoint returned `200` against a fresh backend process.

