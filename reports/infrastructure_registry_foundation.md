# Infrastructure Registry Foundation

Delivered the infrastructure foundation for LDCN OS so the wizard, blueprint preview, and framework specialist layers can recommend infrastructure without generating code, IA, agents, voice, or avatars.

## Contract

- Added `packages/contracts/infrastructure.contract.ts`
- Defined:
  - `InfrastructureComponent`
  - `InfrastructureCategory`
  - `InfrastructureProvider`
  - `InfrastructureRecommendation`
  - `InfrastructureCompatibilityRule`
  - `InfrastructureProfile`

## Backend

- Added `apps/api/app/services/infrastructure_registry_service.py`
- Added `apps/api/app/routes/infrastructure.py`
- Added `apps/api/app/schemas/infrastructure.py`
- Registered the router in `apps/api/app/main.py`

### Endpoints

- `GET /api/infrastructure/components`
- `GET /api/infrastructure/categories`
- `GET /api/infrastructure/components/{component_id}`
- `GET /api/infrastructure/recommendations`
- `POST /api/infrastructure/recommendations`

## Registry Scope

Initial component groups are covered for:

- databases
- cache
- queue
- object storage
- auth provider
- observability
- deployment
- containerization
- api gateway
- search
- vector database
- email provider
- payment provider

## Frontend

- Added hooks:
  - `apps/web/hooks/use-infrastructure-components.ts`
  - `apps/web/hooks/use-infrastructure-recommendations.ts`
- Updated the wizard to show infrastructure recommendations after capabilities/modules.
- Added infrastructure baseline surface in the framework specialist panel.
- Updated LDCN Presence messaging to reflect infrastructure readiness.

## Notes

- Added CORS support for the browser dev origin on port `3001` so Playwright can reach the API during local validation.
- No generation, IA, agents, voice, or avatar were added.
