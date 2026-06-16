# LDCN OS

LDCN OS is a V1 Foundation workspace for planning, validating, previewing, and locally generating governed software project foundations. The current release focuses on deterministic architecture contracts, registry-backed wizard flows, Prompt Master previews, Gatekeeper checks, safe local generation previews, and clear governance surfaces.

V1 Foundation does not run real AI agents, does not call model providers, does not export to Git providers, and does not analyze PDF contracts. Those secure extensions are documented and exposed only as inactive placeholders.

## Stack

- Backend: FastAPI, Pydantic, Uvicorn, pytest
- Frontend: Next.js 15, React 19, TypeScript, TanStack Query, Zustand, Tailwind CSS
- Contracts: shared TypeScript contracts in `packages/contracts`
- Templates: local deterministic templates in `templates`
- Generated output: local project snapshots in `generated-projects`

## Architecture

- `apps/api`: FastAPI app, routes, schemas, engines, services, tests
- `apps/web`: Next.js shell, pages, API client, UI components, frontend tests
- `packages/contracts`: shared TypeScript contracts used by the frontend and documentation
- `templates`: local static/site/app templates used by local generation V0
- `generated-projects`: active, archived, and temp generated output areas
- `future`: reserved future service/engine boundaries
- `reports`: validation, governance, and architecture reports

## Run Locally

```powershell
python -m pip install -r apps\api\requirements.txt
cd apps\web
npm.cmd install
cd ..\..
.\dev.cmd
```

The root `.\dev.cmd` command starts both applications. Press `Ctrl+C` to stop them together.

- Backend URL: `http://127.0.0.1:8001`
- Frontend URL: `http://localhost:3000`
- The frontend defaults to `http://127.0.0.1:8001` for API calls. Override with `NEXT_PUBLIC_API_URL` if needed.

## Test

```powershell
python -m pytest apps/api/tests
```

```powershell
cd apps\web
npm run typecheck
npx tsc --noEmit
npm run build
```

## Ports

- `8001`: FastAPI backend
- `3000`: Next.js frontend dev server

## Current Limitations

- No real AI/model provider calls.
- No real agent runtime.
- No production authentication or authorization.
- No GitHub/GitLab export.
- No PDF parsing, OCR, or contract analysis.
- Local generation supports deterministic foundation templates only.
- Placeholder secure extension endpoints return HTTP `501`.

## Planned Features

- User Key Boost for temporary user-owned AI keys.
- Git Export to GitHub/GitLab after Security Gate validation.
- PDF Contract Input for embedded-text contract understanding.
- Future agent/service boundaries under `future`.
