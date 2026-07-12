# Frontend Backend Integration Foundation

Date: 2026-05-19

## Scope delivered

- Real frontend to backend integration added between `apps/web` and `apps/api`
- Centralized API config created with `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001`
- Typed API layer added in:
  - `apps/web/lib/api/client.ts`
  - `apps/web/lib/api/endpoints.ts`
  - `apps/web/lib/api/types.ts`
- Query hooks added for:
  - `use-health`
  - `use-stacks`
  - `use-templates`
  - `use-projects`
  - `use-downloads`

## Connected pages

- Dashboard now reads backend health, stack count, and project count
- Projects now lists real projects and creates a real foundation project with `POST /api/projects`
- Templates now lists real backend templates
- Wizard now lists real backend stacks
- Settings now shows API URL and live backend health state
- Documentation remains foundation-only

## Quality behaviors added

- HTTP errors surface clearly and are not hidden inside `200` states
- Offline backend state is explicit in UI
- Loading skeletons reused from existing components
- Empty states reused from existing components
- Retry actions wired to React Query refetches
- Toast success and error states wired to project creation

## Notes

- Contract field names were aligned to the existing `packages/contracts` structure
- Frontend types were prepared to reference future shared contracts through `@contracts/*`
- No AI, generation, agents, voice, or avatar logic was added
