# Technology Graph Refactor

Date: 2026-05-20

## Objective

Refactor the LDCN OS registry model so the platform no longer treats framework as the root stack abstraction.

Official hierarchy after this change:

`Language -> Runtime -> Framework -> Architecture -> Archetype -> Capabilities -> Business Modules -> Endpoints`

## Delivered

- Added contracts for `language`, `runtime`, `framework type`, `framework`, and `architecture`.
- Updated archetype, capability, endpoint, compatibility, wizard, project, and generation contracts to support the technology graph.
- Added backend registries for languages, runtimes, frameworks, and architectures.
- Refactored registry validation to resolve and validate the full graph.
- Updated frontend Wizard, Projects, Settings, and Command Palette to consume the graph from the backend.

## Key Corrections

- `spring_boot` is now modeled under `java + jvm`.
- `nestjs` is now modeled under `typescript/javascript + nodejs`.
- `fastapi` is now modeled under `python + python_runtime`.
- `nextjs`, `react`, and `angular` are represented as framework-layer choices instead of root stacks.
- Archetype legacy architecture levels are normalized into real architecture ids in the backend repository layer.

## Result

The platform now represents technology choices as a graph instead of flattening framework and stack into the same concept, which prepares the Wizard Engine for enterprise-grade compatibility validation without introducing code generation or AI behavior.
