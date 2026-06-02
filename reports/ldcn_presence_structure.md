# LDCN Presence Structure

## Scope

Restored a reserved LDCN presence layer for the engineering shell without adding voice, avatar, generation, or AI execution.

## Added Structure

- `packages/contracts/ldcn.contract.ts`
- `apps/web/stores/use-ldcn-store.ts`
- `apps/web/components/ldcn/ldcn-presence-core.tsx`
- `apps/web/components/ldcn/ldcn-orb.tsx`
- `apps/web/components/ldcn/ldcn-status-pill.tsx`
- `apps/web/components/ldcn/ldcn-context-panel.tsx`
- `apps/web/components/ldcn/ldcn-command-surface.tsx`
- `apps/web/components/ldcn/ldcn-presence-rail.tsx`

## Integration Points

- Topbar shows the LDCN status pill.
- Dashboard exposes the LDCN presence surface.
- Wizard includes the LDCN context rail.
- Project detail includes the LDCN readiness insight placeholder.

## Constraints Kept

- No voice integration.
- No avatar functionality.
- No AI calls.
- No generation flow changes.
- No blocking overlays.
- No sidebar overlap.

## Notes

The layer is intentionally passive. It only communicates route, phase, and pipeline awareness as a visual system reserved for future orchestration.
