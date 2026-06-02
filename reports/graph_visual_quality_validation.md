# Graph Visual Quality Validation

Status: approved on 2026-05-28.

The graph uses custom SVG edges and positioned CSS nodes, not React Flow. The visual treatment stays within the LDCN OS shell: restrained surfaces, subtle glow, readable hierarchy, and no crypto-dashboard/neon-heavy styling.

Validated visual behavior:

- Clear hierarchy from client/frontend to gateway/application/services to data/infrastructure/external providers.
- Edges are curved, legible, and expose relationship metadata on hover/title.
- Animated edges are reserved for async/event/telemetry flows.
- Nodes show burden and readiness badges directly.
- Warning/degraded nodes receive distinct border treatment.
- Details panel exposes risk, ownership, burden, and readiness without opening a modal.
- Legend remains visible above the canvas.
- Zoom in, zoom out, and fit controls remain available.
- Dense/mobile graphs use a simplified summary instead of forcing a wide graph into the viewport.
- Wizard and Project Detail render graph surfaces without triggering code generation.
- LDCN presence text reflects graph synchronization states such as Kafka burden, Kubernetes SRE ownership, payment audit trail, and architectural graph sync.

Validation note:

- The in-app Browser automation runtime failed to start in this environment with a Windows sandbox spawn error. Visual/runtime validation was completed through Playwright against the local app instead.

Evidence:

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `npx tsc --noEmit`: passed.
- `npx playwright test tests/architectural-graph.spec.ts`: 8 passed.
