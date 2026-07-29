# Project Detail Runtime Validation

Validated on 2026-05-20.

## Runtime Checks

- Project details page opens after save redirect
- Project registry list renders real persisted projects
- Backend offline state is shown in the UI when the registry request fails
- Detail page shows blueprint summary, Prompt Master summary, Gatekeeper result, readiness status, selected endpoints, and selected modules

## Validation

- `npx playwright test tests/blueprint-preview.spec.ts --grep "wizard save flow"`

