# Stack Contract Validation

Date: 2026-05-20

## Contract changes validated

- `StackContract` now exposes:
  - `id`
  - `category`
  - `status`
  - `supported_locales`
  - `supported_generation_modes`
  - `allowed_architectures`
  - `required_fields`
  - `optional_fields`
  - `features`
  - `constraints`
  - `wizard_profile`
  - `template_compatibility`
  - `gatekeeper_profile`
- `LocaleSupportContract` and `LocaleDirection` added to locale contracts

## Validation results

- Backend compile: `python -m compileall apps/api` passed
- Backend tests: `pytest` passed with `8 passed`
- Frontend build: `npm run build` passed
- Frontend typecheck: `npx tsc --noEmit` passed

## Compatibility notes

- `TemplateContract` and `ProjectContract` continue using `stackId`, but now point to canonical registry ids like `fastapi`
- Legacy persisted project rows with `stack_*` ids are migrated to canonical ids during backend initialization
- Frontend `@contracts/*` alias remains aligned with the updated contracts
