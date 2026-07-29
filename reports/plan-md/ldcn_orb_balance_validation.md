# LDCN Orb Balance Validation

## Validation checklist
- `npm run build` passed.
- `npm run typecheck` passed.
- `npx tsc --noEmit` passed after the Next build generated `.next/types`.

## Balance outcome
- Orb no longer dominates the card composition.
- The presence surface keeps a passive operational role.
- Mobile and compact layouts keep the indicator small and non-intrusive.

## Notes
- The visual refinement was applied in:
  - `apps/web/components/ldcn/ldcn-orb.tsx`
  - `apps/web/components/ldcn/ldcn-presence-core.tsx`
  - `apps/web/components/ldcn/ldcn-presence-rail.tsx`
  - `apps/web/components/ldcn/ldcn-avatar-skeleton.tsx`

