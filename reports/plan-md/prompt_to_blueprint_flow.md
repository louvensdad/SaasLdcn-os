# PromptMaster → Blueprint Flow

## The corrected journey
```
Project Room
  └─ chat → PromptMaster generated (PROMPT_READY)
  └─ approve PromptMaster (APPROVED)
       └─ [Open Architect Engine]  ← the only forward action at APPROVED now
            Architect Engine (/architect?projectId=)
              └─ Generate blueprint (BLUEPRINT_READY)
              └─ Approve & send to Meta-Factory (SENT_TO_GENERATOR)
                   └─ Meta-Factory builds from spec + approved blueprint
```

## Project Room changes (`/project-rooms/[roomId]`)
The room already showed the status stepper and inline actions. To make Architect the **explicit, required** stage (not a loose inline action):
- At **APPROVED**, the inline "generate blueprint" button + the direct "send to Meta-Factory" were **replaced** by a single primary CTA: **Open Architect Engine** → `/architect?projectId=`.
- At **BLUEPRINT_READY**, the room shows **Review in Architect** + **Send to Meta-Factory**.
- The dead inline `handleBlueprint` handler and its unused `Layers` icon were removed.

Net effect: you can no longer jump from an approved PromptMaster straight into generation — the blueprint stage is on the critical path.

## Status semantics surfaced to the user
- `PROMPT_READY` → "approve PromptMaster"
- `APPROVED` → "PromptMaster approved · awaiting Blueprint" → Open Architect
- `BLUEPRINT_READY` → "Blueprint ready" → review / send
- `SENT_TO_GENERATOR` / `GENERATED` → handed off to Meta-Factory

## Data is real end-to-end
Every transition calls an existing backend endpoint (`approve`, `blueprint`, `send-to-generator`); no mocked states.

## Validation
`tsc` clean · `next build` ✓ (`/project-rooms/[roomId]` 5.71 kB).
