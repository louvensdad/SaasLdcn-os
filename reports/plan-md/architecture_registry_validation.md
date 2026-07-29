# Architecture Registry Validation

Date: 2026-05-20

## Scope

Validated the architecture registry and the transition from legacy architecture levels to architecture ids.

## Architectures Included

- `monolith`
- `modular_monolith`
- `microservices`
- `event_driven`
- `cqrs`
- `serverless`
- `distributed_system`
- `hexagonal`
- `clean_architecture`

## Validation Results

- `GET /api/registry/architectures`: passed
- `GET /api/registry/frameworks/{framework_id}/architectures`: passed
- Backend archetype normalization from legacy `supported_architecture_levels` to real architecture ids: passed
- `microservices` compatibility rules for `docker`, `observability`, and `queue`: passed
- React backend archetype rejection: passed

## Notes

- The backend repository now translates legacy archetype architecture levels into architecture ids before response validation.
- The Wizard architecture step is now driven by the selected framework rather than by a flat architecture-level list.
