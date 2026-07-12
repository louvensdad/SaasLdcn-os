# Engineering Laboratory

## Status

Implemented the first real Engineering Laboratory surface for generated projects.

## Delivered

- New protected FastAPI routes under `/api/engineering-lab/projects/{project_id}`.
- Real overview based on files materialized in `generated-projects/{project_id}`.
- Backend terminal execution with project-scoped cwd, allowlisted executables, stdout, stderr, exit code and timing.
- New Next.js page at `/engineering-laboratory`.
- Dedicated module rail, telemetry strip, API, security, quality, architecture, database, tests, dependencies, DevOps, AI and export panels.
- Navigation and Ctrl+K search entry.

## Data Policy

The laboratory does not invent results. Unsupported or unconfigured modules report `not_configured` or `unsupported`.
