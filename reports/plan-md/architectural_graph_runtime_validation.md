# Architectural Graph Runtime Validation

Status: passed on 2026-05-28.

Runtime coverage:

- Backend route `POST /api/architectural-graph/preview` returns a valid graph contract.
- Monolith: client/application/data path is present.
- Modular monolith: internal modules are attached to the application shell.
- Microservices: client/frontend to gateway to service topology is present.
- Event-driven: producer to event bus to consumer topology is present.
- Payments: external provider and audit trail are present.
- Kafka: event bus node returns high burden and operational warning.
- Kubernetes: deployment node returns enterprise burden and `devops/sre` ownership.
- Unsupported architecture: safe fallback graph is returned with warnings.

Frontend runtime coverage:

- Wizard renders the graph in Blueprint Review.
- Changing architecture/capability selection changes graph nodes.
- Node click opens the details panel.
- Edge metadata exposes source, relation type, target, and label.
- Legend is visible.
- Mobile uses a simplified node summary for dense graphs and avoids horizontal document overflow.
- Backend offline state renders a safe message and does not break the wizard.
- Project Detail renders the saved graph snapshot when available.
- Project Detail still renders via preview fallback for records without a snapshot.
- No code-generation endpoint is invoked by graph preview or Project Detail graph rendering.

Evidence:

- `pytest apps/api/tests`: 99 passed.
- `npx playwright test tests/architectural-graph.spec.ts`: 8 passed.
