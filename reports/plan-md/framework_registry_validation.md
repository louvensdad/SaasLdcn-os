# Framework Registry Validation

Date: 2026-05-20

## Scope

Validated the framework registry as the canonical source for framework metadata, framework type, runtime binding, architecture support, archetype support, and capability support.

## Frameworks Included

- Java: `spring_boot`, `quarkus`, `micronaut`
- TypeScript/JavaScript: `nestjs`, `nextjs`, `express`, `fastify`, `angular`, `react`
- Python: `fastapi`, `django`, `flask`
- C#: `aspnet_core`, `blazor`
- PHP: `laravel`
- Go: `fiber`, `gin`

## Validation Results

- `GET /api/registry/frameworks`: passed
- `GET /api/registry/frameworks/{framework_id}`: passed
- `GET /api/registry/languages/{language_id}/frameworks`: passed
- `GET /api/registry/frameworks/{framework_id}/architectures`: passed
- `GET /api/registry/frameworks/{framework_id}/archetypes`: passed
- Backend `pytest`: passed
- Frontend build and typecheck consuming framework metadata: passed

## Notes

- The frontend Wizard now uses framework metadata directly for choice flow and preview.
- The Projects page now persists and displays `frameworkId` separately from legacy `stackId`.
