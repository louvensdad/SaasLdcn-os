# Truth validation

The presence engine selects unresolved high-priority evidence before recent success events. Resolved critical events are excluded from active dominance. Empty evidence remains compatible with the existing healthy response; stale warnings no longer dominate. Runtime/API failures retain the last valid frontend data but display a stale/unavailable state instead of green.

Validation: existing presence tests 8 passed; Phase 2 priority/isolation tests 2 passed; Activity Feed + Git regression tests 11 passed; frontend typecheck passed. Full production build should be rerun after final integration.