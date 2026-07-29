# LDCN OS

LDCN OS is a workspace for planning, validating, generating, and modernizing governed software project foundations. It combines deterministic architecture contracts, registry-backed wizard flows, Prompt Master previews, Gatekeeper checks, and clear governance surfaces with an AI meta-factory that turns an idea into a full, secure project — and a brownfield path that ingests and refactors an existing codebase.

**AI with graceful degrade.** The multi-provider LLM router (Anthropic / OpenAI / Google) is optional: when no provider key/SDK is reachable, the system falls back to a deterministic high-fidelity Mock generator instead of failing. The degrade is always signalled to the UI (`degraded` / "Modo Mock"), never disguised as a real model run. Set `LDCN_FORCE_MOCK=1` for a fully offline demo.

PDF contract analysis remains an inactive placeholder.

## Stack

- Backend: FastAPI, Pydantic, Uvicorn, pytest
- Frontend: Next.js 15, React 19, TypeScript, TanStack Query, Zustand, Tailwind CSS
- Contracts: shared TypeScript contracts in `packages/contracts`
- Templates: local deterministic templates in `templates`
- Generated output: local project snapshots in `generated-projects`

## Architecture

- `apps/api`: FastAPI app, routes, schemas, engines, services, tests
  - `app/engines/llm`: multi-provider LLM router + adapters + deterministic mock fallback
  - meta-factory: orchestrator → mega-prompt → API-first agent pipeline (`/meta-factory/*`, incl. SSE `generate/stream`)
  - modernize: brownfield ingestion (ZIP/Git) → diagnosis → migration plan → refactor (`/modernize/*`)
  - account security: session listing/revocation, TOTP 2FA, consent revoke, activity export (`/auth/*`)
  - presence + telemetry: engineering presence and runtime metrics engines feeding the shell's live status surfaces
- `apps/web`: Next.js shell, pages, API client, UI components, frontend tests
  - `/meta-factory` (greenfield, real-time progress) and `/modernize` (brownfield) surfaces
  - `/settings`: unified premium settings shell (Conta, IA, Git, Interface, Runtime, Avançado) on shared components
- `packages/contracts`: shared TypeScript contracts used by the frontend and documentation
- `templates`: local static/site/app templates used by local generation V0
- `generated-projects`: active, archived, and temp generated output areas
- `future`: reserved future service/engine boundaries
- `reports`: validation, governance, and architecture reports
- `docs/design-system`: visual reference material used to keep the shell pixel-faithful to design

## Run Locally

```powershell
python -m pip install -r apps\api\requirements.txt
cd apps\web
npm.cmd install
cd ..\..
.\dev.cmd
```

The root `.\dev.cmd` command starts both applications. Press `Ctrl+C` to stop them together.

- Backend URL: `http://localhost:8001`
- Frontend URL: `http://localhost:3000`
- The frontend defaults to `http://localhost:8001` for API calls. Override with `NEXT_PUBLIC_API_URL` if needed.

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

- Real model calls require provider SDKs + API keys (`ANTHROPIC_API_KEY` / `OPENAI_API_KEY` / `GOOGLE_API_KEY`); without them, the deterministic Mock generator serves instead (signalled as `degraded`).
- Production authentication requires explicit JWT/encryption secrets, PostgreSQL, Redis-backed distributed controls, trusted hosts, and HTTPS origins.
- Brownfield Git ingestion runs in the sandbox, accepts HTTPS URLs only, and restricts hosts through `LDCN_MODERNIZE_GIT_ALLOWED_HOSTS`.
- No PDF parsing, OCR, or contract analysis (inactive placeholder).
- Account security covers session/device listing, revocation, and TOTP 2FA; backup codes, new-login email alerts, account deactivation, and workspace invites are not yet implemented.

## Planned Features

- PDF Contract Input for embedded-text contract understanding.
- Future agent/service boundaries under `future`.
