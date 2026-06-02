# PDF Contract Input Architecture

## Scope

Phase A defines the contract and workflow for uploading a PDF contract and extracting embedded text for project context. It does not perform OCR and does not generate a project automatically.

## Contract

The canonical TypeScript contract is `packages/contracts/pdf-contract.contract.ts`.

The report maps:

- business rules
- deliverables
- constraints
- deadlines
- compliance
- payment terms
- scope exclusions
- risks
- project requirements

## Foundation endpoints

- `POST /api/contracts/upload-pdf`
- `POST /api/contracts/analyze`
- `GET /api/contracts/{contract_id}/report`

Upload should be multipart in backend implementation, while response payloads follow the contract file. Analysis consumes extracted embedded PDF text only.

## Upload policy

- Accept only `application/pdf`.
- Enforce a configured max size.
- Normalize stored file names.
- Reject absolute paths, `..`, null bytes, and user-controlled storage paths.
- Do not OCR initially.
- Do not include raw contract text in logs.

## Frontend targets

- Wizard -> Contract Input
- Project Detail -> Contract Context

The UI should show Contract Summary, Requirements extracted, Risks, Constraints, and Blueprint suggestions. It should not auto-trigger Blueprint, Prompt Master, or generation.

## Non-goals in Phase A

- No OCR.
- No legal advice.
- No automatic project generation.
- No full-text contract display in logs or traces.
