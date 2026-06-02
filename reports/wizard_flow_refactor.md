# Wizard Flow Refactor

Date: 2026-05-20

## New Flow

1. Language
2. Runtime
3. Framework
4. Architecture
5. Archetype
6. Capabilities
7. Business Modules
8. Endpoints
9. Validate selection
10. Blueprint summary

## Frontend Changes

- Wizard now consumes real backend registries for language, runtime, framework, and architecture.
- Command Palette now lists languages, frameworks, architectures, archetypes, and capabilities from live registry data.
- Projects now display persisted technology graph metadata.
- Offline state remains explicit and non-breaking when the backend is unavailable.

## Runtime Validation

- `npx playwright test tests/registry-online.spec.ts --reporter=line`: passed
- `npx playwright test tests/registry-offline.spec.ts --reporter=line`: passed
- Online Wizard validated real selection flow with:
  - `typescript`
  - `nodejs`
  - `nestjs`
  - `modular_monolith`
  - `ai_saas`
- Command Palette listed real registry items: passed
- Offline Wizard showed explicit backend unavailable state: passed

## Result

The Wizard foundation is now aligned with the official technology graph and is ready for future blueprint generation layers without introducing generation logic yet.
