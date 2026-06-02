# Project Registry Save Flow

Validated on 2026-05-20.

## Scope

- Backend: `POST /api/projects/save-from-wizard`, `GET /api/projects/{project_id}`, `PATCH /api/projects/{project_id}`, `DELETE /api/projects/{project_id}`
- Frontend: Wizard save action, project details page, projects list
- Contract: `packages/contracts/project.contract.ts`

## Results

- Save flow persists a ProjectRecord from `ProjectBlueprint`, `PromptMasterDocument`, and `GatekeeperReport`
- Approved and approved-with-warnings gatekeeper decisions map to `ready_for_generation`
- Blocked gatekeeper decisions map to `generation_blocked`
- No code generation is triggered
- No IA, agents, voice, or avatar features are invoked

## Validation

- `pytest apps/api/tests/test_project_registry.py apps/api/tests/test_api.py`
- `npm run typecheck`
- `npx tsc --noEmit`
- `npm run build`
- `npx playwright test tests/blueprint-preview.spec.ts --grep "wizard save flow"`

