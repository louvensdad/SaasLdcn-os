# Active Runtime Map

Status: completed

Backend runtime:
- App entrypoint: `apps/api/app/main.py`
- Routes: `apps/api/app/routes`
- Schemas: `apps/api/app/schemas`
- Services: `apps/api/app/services`
- Engines: `apps/api/app/engines`
- Repositories: `apps/api/app/repositories`
- Registry data: `apps/api/app/registry`
- Local SQLite data: `apps/api/app/data`
- Tests: `apps/api/tests`

Frontend runtime:
- Next app: `apps/web/app`
- Components: `apps/web/components`
- Hooks: `apps/web/hooks`
- API client: `apps/web/lib/api`
- State stores: `apps/web/stores`
- Tests: `apps/web/tests`

Shared active package:
- Contracts: `packages/contracts`

Generation runtime:
- Templates: `templates`
- Active generated outputs: `generated-projects/active`
- Archived generated outputs: `generated-projects/archived`
- Temporary generated outputs: `generated-projects/temp`

Not active in runtime:
- `future/*`
- `apps/admin`
- `apps/studio`
- `apps/docs`
- empty/reserved packages outside `packages/contracts`
- `infrastructure/*`

