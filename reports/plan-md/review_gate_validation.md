# Review Gate — Validation

## Requirement
> Block the Meta-Factory when: PromptMaster not approved · Blueprint missing · Architecture Review not approved. No shortcuts.

## Where the gate lives
`app/(app)/meta-factory/page.tsx` — the room-load effect classifies an incoming `?projectId=` into states, each with its own screen and forward CTA:

| Condition (real `room` data) | State | Screen → CTA |
|---|---|---|
| No spec/prompt, or status before `APPROVED` | `blocked` | "PromptMaster required" → Project Room |
| Approved prompt, **no `architecture_blueprint`** | `needs_blueprint` | → **Architect Engine** |
| Blueprint exists, status `BLUEPRINT_READY` / `ENGINEERING_REVIEW` (review **not** approved) | `needs_review` | → **Engineering Review** |
| `SENT_TO_GENERATOR` / `GENERATED` (review approved) | `loaded` | build proceeds |

So generation can start **only** after the review is approved (`sendToGenerator`, which the Review Center's "Approve" button calls → status `SENT_TO_GENERATOR`). There is no path from an approved prompt or an un-reviewed blueprint straight into generation.

## The Meta-Factory also *receives* the approved blueprint
On `loaded`, the room's `architecture_blueprint` is captured and passed to `generateStageStream(..., blueprint)`; the backend appends it via `compile_mega_prompt(spec, blueprint)`, so agents build against the reviewed decisions — the review is consequential, not cosmetic.

## Project Room enforcement (no shortcuts upstream)
- `APPROVED` → only forward action is **Open Architect Engine**.
- `BLUEPRINT_READY` → **Open Engineering Review** (starts `ENGINEERING_REVIEW`).
- The old "send straight to Meta-Factory" action was removed.

## Collision note
A parallel edit added a duplicate `needs_review` branch (hardcoded non-i18n strings) and a duplicate shell key; both were de-duplicated. The surviving gate uses i18n (`metaFactory.reviewGate.*`).

## Validation
`tsc` clean · `next build` ✓. Manual trace: room without blueprint → `needs_blueprint`; blueprint but `BLUEPRINT_READY` → `needs_review`; only `SENT_TO_GENERATOR` reaches `loaded`.
