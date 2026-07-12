# Blueprint Preview Runtime Validation

Date: 2026-05-20

## Static validation

- `npm run build`: passed
- `npm run typecheck`: passed
- `npx tsc --noEmit`: passed

## Backend validation

- `pytest -q`: passed with `35 passed`
- Valid preview request returns normalized `ProjectBlueprint`
- Invalid payload returns `422`
- Incompatible framework selection returns `validation.valid=false`
- Endpoint without capability returns validation errors
- Microservices selection triggers recommendations
- `ai_chat` selection triggers recommendations
- Complexity score increases as endpoints and capabilities increase

## Frontend runtime validation

Online:
- `npx playwright test tests/registry-online.spec.ts tests/blueprint-preview.spec.ts --reporter=line`: passed

Validated online behaviors:
- Wizard reaches Blueprint Review with progressive disclosure intact
- `Preview blueprint` calls the real backend endpoint
- loading state renders while request is pending
- invalid selection state renders backend validation errors
- request error state renders explicit failure feedback
- valid preview renders technology graph, architecture profile, and complexity profile

Offline:
- `npx playwright test tests/registry-offline.spec.ts --reporter=line`: passed

Validated offline behavior:
- Wizard remains usable when the API is unavailable
- preview action shows explicit request failure state
- no hidden crash or blank review state occurred

## Notes

- A stale incremental TypeScript cache initially interfered with standalone `tsc` validation
- `apps/web/tsconfig.json` now disables incremental compilation to keep CI-style typecheck deterministic in this workspace
- No generation path was added in this foundation pass
