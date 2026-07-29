# Architecture Review Center

## Goal
Turn the blueprint step into a real **engineering review** the user trusts — "my architecture was reviewed, validated and approved before generation" — using **only real data** from the PromptMaster (`ProjectRoomSpec`) and the `ArchitectureBlueprint`. No invented metrics, risks, costs, scores, or confidence.

## Journey (now official)
```
Project Room → PromptMaster (approved) → Architect Engine (blueprint)
            → Architecture/Engineering Review → Meta-Factory
```
Backed by a real backend status flow: `APPROVED → BLUEPRINT_READY → ENGINEERING_REVIEW → SENT_TO_GENERATOR → GENERATED` (the `ENGINEERING_REVIEW` status + `POST /project-rooms/{id}/engineering-review` were added; the route `/engineering-review` is the Review Center).

## The no-fake guarantee — `lib/architecture-review/derive.ts`
All panels read from a **pure derivation layer**. Every value is either real or returns `null` → the UI shows **"Informação ainda indisponível."**

| Panel | Real source | When unavailable |
|---|---|---|
| Executive summary | `room.title`, `spec.product_summary`, `spec.suggested_stack`, blueprint decisions (backend/frontend/database/deploy) | per-field "indisponível" |
| Complexity | **justified band** from real counts (entities + workflows + rules + users), basis shown explicitly | hidden if no spec |
| Readiness | `spec.confidence` (real %) | "indisponível" |
| Engineering readiness | **decision coverage** `decided/10` + security presence (`auth`+`authorization`) — coverage, not invented grades | — |
| Decisions / trade-offs | blueprint `choice` + `justification` + `alternatives_considered` | "no alternatives recorded" |
| Risk center | **real** `spec.open_questions` + `spec.assumptions` (uncertainties the orchestrator flagged) | "no risks recorded" |
| Estimates | real counts only (entities, workflows, rules, users, decisions, open questions) | omitted |
| Diagram | nodes = **decided** areas only, in request-flow order; clickable → scrolls to the decision | "appears once decisions exist" |
| Origin | `blueprint.degraded` → AI-authored vs Deterministic preview | — |
| Timeline | derived from real `room.status` | — |

**Explicitly NOT shown** (no backend data → would be fabricated): per-area risk probability, per-decision confidence, monetary cost, token/time/file estimates, advantages/disadvantages text. (A parallel draft had invented all of these; it was replaced with this real-data version at the user's direction.)

## UX
Premium, token-driven (Engineering Runtime): glass cards, generous spacing, a journey timeline, a clickable diagram, accordions/cards instead of dense tables, reduced-motion-safe. Reuses the shared design system (Card/Badge/Button/`t-*` type, `JourneyTimeline`).

## Files
- `lib/architecture-review/derive.ts` (pure, testable)
- `components/architecture-review/journey-timeline.tsx`
- `hooks/use-project-room.ts` (shared by Architect + Review)
- `app/(app)/engineering-review/page.tsx`

## Validation
`tsc --noEmit` clean · `next build` ✓ · reachable from Architect, Project Room, the platform map and nav.
