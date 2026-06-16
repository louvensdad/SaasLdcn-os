# Generated Project Quality Gate V1

## Scope

Implemented a deterministic static quality gate for generated backend projects.

- Endpoint: `POST /api/generated-projects/{project_id}/quality-check`
- Engine: `apps/api/app/engines/generated_project_quality_engine.py`
- Schemas: `apps/api/app/schemas/generated_project_quality.py`
- Route: `apps/api/app/routes/generated_project_quality.py`
- Frontend panel: Project Detail / Generated Project Quality Gate
- Contract: `packages/contracts/generated-project-quality.contract.ts`

## Response

The gate returns:

- `passed`
- `failed`
- `warnings`
- `score`
- `checks`
- `missing_files`
- `security_findings`

## Runtime Guarantees

- No npm install
- No mvn package
- No pip install
- No docker
- No shell execution
- No internet access
- No generated code execution

## Validation

Backend quality tests cover:

- FastAPI quality pass
- Spring Boot quality pass
- NestJS quality pass
- Missing file failure
- Secret detection failure

Frontend coverage adds Project Detail rendering for:

- Run Quality Gate
- Score
- Checklist
- Validated state

