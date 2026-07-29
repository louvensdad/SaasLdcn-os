# Compatibility Validation

Date: 2026-05-20

## Scope

- Added official compatibility contracts in `packages/contracts/compatibility.contract.ts`.
- Added backend compatibility rule seed in `apps/api/app/registry/compatibility_registry.py`.
- Added backend validation endpoint:
  - `POST /api/registry/validate-selection`
- Added frontend mutation hook:
  - `apps/web/hooks/use-selection-validation.ts`
- Added Wizard validation UI with errors, warnings, recommendations, and blueprint summary.

## Implemented Rules

- Archetype must support the selected stack.
- Archetype must support the selected architecture level.
- Capability must support the selected stack.
- Capability minimum architecture level is enforced.
- Capability dependencies and conflicts are enforced.
- Business module must support the selected stack.
- Endpoint must support the selected stack.
- Endpoint minimum architecture level is enforced.
- Endpoint required capabilities are enforced.
- `static_site` blocks backend endpoint groups.
- `landing_page` recommends `seo`.
- `ai_saas` recommends `ai_chat`.
- `payments` requires business context.
- `level_4_distributed` requires `docker` and `observability`.
- Architecture-level required capabilities are enforced.

## Validation Results

- Valid payload for `nestjs` + `ai_saas` + `level_3_enterprise`: passed
- Invalid payload with `ai.chat` without `ai_chat`: passed
- Invalid payload with `static_site` + backend endpoint: passed
- Invalid payload for `level_4_distributed` without required capabilities: passed

## Outcome

Compatibility is no longer silent or implied. The backend now returns explicit `errors`, `warnings`, `recommended_additions`, and `resolved_blueprint_summary`.
