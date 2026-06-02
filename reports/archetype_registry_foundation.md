# Archetype Registry Foundation

Date: 2026-05-20

## Scope

- Added official archetype contracts in `packages/contracts/archetype.contract.ts`.
- Added backend archetype registry seed in `apps/api/app/registry/archetypes_registry.py`.
- Added backend endpoints:
  - `GET /api/registry/archetypes`
  - `GET /api/registry/archetypes/{archetype_id}`
  - `GET /api/registry/stacks/{stack_id}/archetypes`
- Updated frontend Wizard and Command Palette to consume real archetype registry data.

## Seed Coverage

- Frontend/sites:
  - `landing_page`
  - `institutional_site`
  - `portfolio`
  - `blog`
  - `sales_page`
  - `catalog_site`
  - `documentation_site`
- Applications:
  - `saas_dashboard`
  - `admin_panel`
  - `crm`
  - `erp`
  - `marketplace`
  - `ecommerce`
  - `booking_system`
  - `elearning_platform`
- Backend/API:
  - `rest_api`
  - `async_api`
  - `microservice_api`
  - `banking_api`
  - `healthcare_api`
  - `integration_api`
  - `realtime_api`
- AI-oriented planning:
  - `ai_saas`
  - `ai_agent_platform`
  - `rag_system`
  - `chatbot_platform`
  - `automation_agent`
- Architecture:
  - `modular_monolith`
  - `microservices_platform`
  - `event_driven_system`

## Validation

- `pytest`: passed
- `GET /api/registry/archetypes`: passed
- `GET /api/registry/archetypes/ai_saas`: passed
- `GET /api/registry/stacks/nestjs/archetypes`: passed
- Wizard runtime consuming live archetypes: passed

## Outcome

The platform now distinguishes project intent (`archetype`) from technology base (`stack`) in contracts, backend registries, and frontend selection flow.
