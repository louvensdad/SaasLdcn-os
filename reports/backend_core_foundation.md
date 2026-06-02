# Backend Core Foundation

Date: 2026-05-19

## Scope delivered

- Backend foundation created only in `apps/api`
- FastAPI app with modular structure in `app/core`, `app/routes`, `app/schemas`, `app/services`, and `app/repositories`
- Local-first SQLite persistence implemented for `projects`
- Explicit foundation seed data added for stacks and templates
- CORS enabled for `http://localhost:3000` and `http://127.0.0.1:3000`
- Request logging and normalized API error responses added

## Endpoints delivered

- `GET /api/health`
- `GET /api/stacks`
- `GET /api/templates`
- `GET /api/projects`
- `POST /api/projects`
- `GET /api/downloads`

## Foundation data

- Stacks seeded: `static_site`, `fastapi`, `spring_boot`, `nestjs`, `nextjs`
- Templates seeded explicitly in code
- Projects start empty by default
- Downloads start empty by default

## Guardrails respected

- No AI, agents, generation, voice, or avatar logic added
- No frontend integration added
- No secrets exposed to frontend
- No hidden mocks added
- Errors return non-200 HTTP codes with explicit payloads

## Main files

- `apps/api/app/main.py`
- `apps/api/app/core/config.py`
- `apps/api/app/core/exceptions.py`
- `apps/api/app/repositories/project_repository.py`
- `apps/api/tests/test_api.py`
