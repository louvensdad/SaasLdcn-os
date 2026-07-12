# Architect Engine — Explicit Journey Stage

## Goal
Insert a clear, real stage between **Project Room** and **Meta-Factory**:

`Project Room → PromptMaster approved → Architect Engine → justified Blueprint → Meta-Factory`

## What existed already (real backend)
- `ProjectRoom.status`: `… APPROVED → BLUEPRINT_READY → SENT_TO_GENERATOR → GENERATED`.
- `ProjectRoom.architecture_blueprint: ArchitectureBlueprint | null`.
- Endpoints: `POST /project-rooms/{id}/blueprint` (generate), `POST /project-rooms/{id}/send-to-generator`.
- `ArchitectureBlueprint = { project_id, decisions[{area, choice, justification, alternatives_considered[]}], degraded, generated_at }`.

So this was a **frontend-only** stage build on top of real endpoints and data.

## What was built
- **New route `/architect`** (`app/(app)/architect/page.tsx`):
  - **Chooser** (no `projectId`): lists rooms whose PromptMaster is approved (`APPROVED / BLUEPRINT_READY / SENT_TO_GENERATOR / GENERATED`), real data from `projectRoomsClient.list()`.
  - **Stage** (`?projectId=`): loads the room and renders state-aware UI:
    - PromptMaster not approved → blocked, routes back to the room.
    - Approved, no blueprint → **Generate blueprint** (`generateBlueprint`).
    - Blueprint present → a **decision grid** (per area: icon, choice, **justification**, **alternatives weighed** = trade-offs), plus **confidence** (room confidence), **AI-authored vs deterministic** badge (`degraded`), and **generated-at**.
    - **Approve & send to Meta-Factory** (`sendToGenerator` → navigate to `/meta-factory?projectId=`).
- **Map + nav**: the `/platform` "Architect" node now points to `/architect`; added a nav entry and topbar copy.

## Honesty notes (no fake data)
- The backend `BlueprintDecision` has **no per-area risk or confidence** field. So per-area "risk/confidence" numbers were **not invented**. Trade-offs are shown as the **real `alternatives_considered`**; confidence is the **room-level** value; the `degraded` flag honestly distinguishes a real-LLM blueprint from the deterministic preview.

## Validation
`tsc --noEmit` clean · `next build` ✓ (`/architect` 5.9 kB) · route renders HTTP 200.
