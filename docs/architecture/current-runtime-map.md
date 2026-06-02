# Current Runtime Map

## `apps/api`

FastAPI backend containing:

- route modules in `apps/api/app/routes`
- Pydantic schemas in `apps/api/app/schemas`
- deterministic engines in `apps/api/app/engines`
- services and local repositories in `apps/api/app/services`
- pytest coverage in `apps/api/tests`

The backend runs locally on port `8001`.

## `apps/web`

Next.js frontend containing:

- app routes under `apps/web/app`
- UI components under `apps/web/components`
- API client and typed frontend models under `apps/web/lib`
- local state stores under `apps/web/stores`
- Playwright-style specs under `apps/web/tests`

The frontend runs locally on port `3000`.

## `packages/contracts`

Shared TypeScript contract definitions for blueprint, project, Prompt Master, Gatekeeper, generation, registries, secure extension placeholders, roadmap, and system status.

## `templates`

Local deterministic template registry and template files. V1 Foundation uses these for local generation V0 and does not require external template marketplaces.

## `generated-projects`

Workspace-local generated output area:

- `active`: generated projects currently used for inspection
- `archived`: retained generated snapshots
- `temp`: temporary output targets

Generated ZIP preparation filters secret-like files and content.

## `future`

Reserved boundaries for future services and engines. These directories are documentation placeholders, not active runtime services in V1 Foundation.

## `reports`

Governance, validation, architecture, UI, security, and release reports. Reports document decisions and validation evidence, but are not runtime dependencies.
