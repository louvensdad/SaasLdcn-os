# Backend Contract Readiness

Date: 2026-05-19

## Readiness assessment

The backend foundation is prepared for future contract alignment without coupling the current API runtime to the frontend contract package yet.

## What is already aligned

- Seed entities expose stable ids such as `stackId`, `templateId`, and `projectId`
- Payload fields follow the existing contract naming style in `packages/contracts`
- Contract metadata field `contractVersion` is present in foundation entities
- Route structure and schema separation make future contract adapters straightforward

## Recommended next step when contracts are connected

- Add a shared validation layer that maps Python schemas to the TypeScript contract definitions
- Introduce explicit enum modules mirroring contract enums for stack, template, and project lifecycle values
- Add contract snapshot tests to detect drift between `apps/api` responses and `packages/contracts`
- Version seed data and API responses together when contract revisions change

## Current intentional limits

- No direct runtime dependency on `packages/contracts`
- No generated clients or OpenAPI-to-contract sync yet
- No orchestration, generation, or agent contracts wired into this backend layer
