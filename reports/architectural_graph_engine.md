# Architectural Graph Engine

Status: approved after validation on 2026-05-28.

The architectural graph engine exposes a deterministic preview endpoint at `POST /api/architectural-graph/preview`. It converts selected architecture, capabilities, business modules, and infrastructure into connected nodes and edges with no AI execution, no code generation, no agents, and no deployment execution.

Validated backend behavior:

- `monolith` produces an application node plus selected database infrastructure.
- `modular_monolith` produces an application shell plus internal module nodes.
- `microservices` produces an API gateway plus service nodes.
- `event_driven` produces producer, event bus, and consumer nodes with event edges.
- `payments` produces an external payment provider and audit trail.
- `kafka` is modeled as an event bus with high operational burden.
- `kubernetes` is modeled as deployment with `devops/sre` ownership.
- Unknown architecture IDs return a safe application graph fallback with warnings.

Project persistence now stores `architectural_graph_snapshot` when saving from the wizard. Project Detail uses that saved snapshot first and only falls back to preview generation for older records without a snapshot. This preserves the no-code-generation boundary.

Validation commands:

- `pytest apps/api/tests`: 99 passed.
- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npx tsc --noEmit`: passed.
- `npx playwright test tests/architectural-graph.spec.ts`: 8 passed.
