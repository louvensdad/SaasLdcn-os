# Stack Registry Foundation

Date: 2026-05-20

## Objective delivered

The Stack Registry is now the official source of truth for stack identity, required fields, allowed architectures, generation modes, locale support, compatibility, and gatekeeper restrictions across contracts, backend, and frontend.

## Scope delivered

- `packages/contracts/stack.contract.ts` restructured around full `StackContract` registry definitions
- `packages/contracts/locale.contract.ts` updated with shared locale support structures
- Backend seeds moved to a structured stack registry in `apps/api/app/data/foundation.py`
- `GET /api/stacks` now returns full stack definitions
- `GET /api/stacks/{stack_id}` now returns a single stack definition
- Templates use canonical stack ids
- Projects are normalized to canonical stack ids
- Wizard, Projects, Templates, Settings, and Command Palette now consume real stack registry metadata

## Canonical stack ids

- `static_site`
- `fastapi`
- `spring_boot`
- `nestjs`
- `nextjs`

## Registry guarantees

- No AI, generation, agent, voice, or avatar capability was enabled
- Stack ids are canonical and shared across contracts, backend, and frontend
- Locale support is embedded in each stack definition
- Allowed architectures and generation modes are explicit
- Required and optional field lists are centralized per stack
- Gatekeeper restrictions are explicit and foundation-safe
