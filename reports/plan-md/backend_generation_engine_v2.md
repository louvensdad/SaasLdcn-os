# Backend Generation Engine V2

Status: implemented

Scope:
- Deterministic backend generation engine added at `apps/api/app/engines/backend_generation_engine.py`.
- API routes added for preview, run, templates and status.
- Contract added at `packages/contracts/backend-generation.contract.ts`.
- No AI, no agents, no shell execution, no deploy and no external access.

Implemented targets:
- FastAPI
- Spring Boot
- NestJS

Reserved targets:
- Quarkus
- Micronaut
- Express
- Fastify

Security gates:
- Blocks path traversal.
- Blocks generation outside workspace.
- Blocks overwrite of existing directories.
- Blocks protected output directory names.
- Requires ready generation handoff before writing files.
