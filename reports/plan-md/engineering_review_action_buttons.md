# Engineering Review Action Buttons

The Review no longer combines approval and handoff into a single opaque operation.

| State | Primary actions |
|---|---|
| Deterministic Blueprint | Validate, regenerate with AI, continue preview, return to Architect |
| LLM Blueprint under review | Validate, approve, regenerate, return to Architect |
| Review approved | Validate, send to Meta-Factory |
| Already sent | Validate, open Meta-Factory |

All mutations replace local room state, invalidate Project Room/Blueprint/Review lifecycle queries, refresh the router and update diagnostics without requiring F5.
