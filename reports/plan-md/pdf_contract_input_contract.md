# PDF Contract Input Contract

Contract file: `packages/contracts/pdf-contract.contract.ts`

## Status

Planned and inactive in V1 Foundation.

## Key points

- Upload policy allows PDF only.
- Size limit is part of the contract policy.
- Embedded text extraction is planned.
- OCR is explicitly disabled initially.
- Report separates business rules, deliverables, constraints, risks, and requirements.
- Contract context is advisory for Blueprint and Prompt Master.
- Auto-generation is disabled.

## Placeholder endpoints

- `POST /api/contracts/upload-pdf`
- `GET /api/contracts/{contract_id}/report`
