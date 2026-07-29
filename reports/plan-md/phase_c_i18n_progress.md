# Phase C - i18n progress

Date: 2026-06-15

## Completed

- `pt-BR`, `en-US`, `es-ES`, and `fr-FR` have exact key parity.
- Each dictionary currently contains 1082 keys.
- `pt-BR` remains the default interface and backend fallback locale.
- Static UI copy was moved to the translation system across:
  - shell, authentication, settings, dashboard, project list, templates, and skills;
  - roadmap, documentation, system status, and architecture surfaces;
  - notification, feedback, overlay, search, activity, LDCN, graph, and system-design components;
  - infrastructure, dependency, and engineering visualization components;
  - Meta-Factory and UX foundation demo.
- `apps/web/scripts/audit-hardcoded-i18n.mjs` provides a reproducible AST audit.
- Package scripts:
  - `npm run audit:i18n`
  - `npm run audit:i18n:check`

## Validation

- `npm run typecheck`: passed.
- `npm run build`: passed, including all 16 generated routes.
- Dictionary parity: 1082 keys, zero missing and zero extra for every locale.

## Remaining

The AST audit currently reports 339 direct JSX findings in two files:

- `apps/web/app/(app)/wizard/page.tsx`: 220
- `apps/web/app/(app)/projects/[projectId]/page.tsx`: 119

The completed project-detail sublot covers its header, snapshot summaries,
template metadata, available skills, and generation-readiness handoff.

These files should be handled as separate batches because they combine large
user-facing flows with generation, quality, Git delivery, and registry state.
The wizard also contains copy in configuration constants that is outside the
direct JSX audit and must be converted during its batch.

`npm run audit:i18n:check` is intentionally expected to fail until these two
files reach zero findings.
