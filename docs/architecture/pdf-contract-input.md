# PDF Contract Input

## V1 Foundation stance

PDF Contract Input is planned but inactive. V1 Foundation does not parse, extract, analyze, OCR, summarize, or store contract text.

Placeholder endpoint responses return `501 Not Implemented` with:

`Feature planned but not active in V1 Foundation.`

## Contract

The canonical contract is `packages/contracts/pdf-contract.contract.ts`.

Future reports must separate:

- business rules
- deliverables
- constraints
- risks
- requirements

## Security rules

- Accept only PDF uploads.
- Enforce a configured size limit.
- Reject path traversal and user-controlled storage paths.
- Extract embedded text only in the first real implementation.
- Keep OCR disabled initially.
- Do not log raw contract text.
- Do not automatically generate a project from the contract.

## Context flow

The contract report may feed Blueprint and Prompt Master context in later phases. It must remain advisory and must not bypass Gatekeeper.

## Placeholder endpoints

- `POST /api/contracts/upload-pdf`
- `GET /api/contracts/{contract_id}/report`

Both currently return `501`.
