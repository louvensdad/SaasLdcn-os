# Engineering Review Unblocked Flow

Engineering Review now exposes independent actions for every lifecycle state:

- Validate Review
- Approve Review
- Send to Meta-Factory
- Open Meta-Factory
- Regenerate Blueprint with AI
- Continue with Deterministic Preview
- Return to Architect

Validation returns current/expected status, active Blueprint version, provider, model, mode, degraded flag, checks, blockers and a recommended action. Provider failures preserve the previous valid Blueprint instead of leaving the room in `BLUEPRINT_GENERATING`.
