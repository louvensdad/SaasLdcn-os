# Impact Engine Validation

## Impact dimensions
- infra_complexity
- deployment_complexity
- operational_burden
- scaling_complexity
- maintenance_cost
- security_surface
- learning_curve
- team_maturity_required

## Validation summary
- `microservices` increased deployment and operational complexity as expected.
- `ai_chat` and `rag` increased infrastructure burden due to vector and async dependencies.
- `payments` increased security burden.
- Impact endpoints returned `200` in a fresh backend runtime check.

