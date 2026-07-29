# Meta-Factory Blueprint Gate

## Acceptance criterion
> "A Meta-Fábrica não pode mais parecer uma etapa solta. Ela deve receber um Blueprint aprovado vindo do Architect Engine."

## Before
When arriving from a room (`/meta-factory?projectId=`), the page loaded the spec for any room in `APPROVED / SENT_TO_GENERATOR / GENERATED` — **a room with no blueprint could still drive a build.** The Meta-Factory was a loose step.

## After — the gate (`app/(app)/meta-factory/page.tsx`)
The room-load logic now classifies into three outcomes:
1. **No approved PromptMaster** (missing spec / prompt, or status before `APPROVED`) → `blocked` (existing screen, back to Project Room).
2. **Approved PromptMaster but no `architecture_blueprint`** → new **`needs_blueprint`** gate: a screen that explains a blueprint is required and routes to **Open Architect Engine** (`/architect?projectId=`).
3. **Approved PromptMaster + Blueprint present** → `loaded`: the spec **and** the blueprint are captured, and the build proceeds.

## The Meta-Factory now *receives* the blueprint (not just gates on it)
- `metaFactoryClient.generateStageStream(...)` gained an optional `blueprint` argument, sent in the request body as `blueprint`.
- The backend already consumes it: `StageGenerateRequest.blueprint` → `compile_mega_prompt(spec, blueprint)` appends the justified architecture decisions to every agent's context.
- The page passes the room's `architecture_blueprint` through to every stage call.

So the approved blueprint genuinely shapes generation — the agents build against the Architect's decisions.

## Manual mode preserved
The standalone path (no `projectId` — type an intent → orchestrate → generate) is unchanged, so the gate doesn't break the direct/Builder entry. The gate applies to the **room-driven** journey, which is where the "loose step" problem lived.

## Validation
`tsc` clean · `next build` ✓ (`/meta-factory` 10.1 kB) · flow Project Room → Architect → Meta-Factory exercised through real endpoints.
