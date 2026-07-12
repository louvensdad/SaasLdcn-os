# Blueprint Provider Metadata Validation

The backend resolves the active Blueprint from `active_blueprint_version` before building readiness and Engineering Review data. Every historical version is normalized to the canonical metadata contract.

Validation checks:

1. PromptMaster exists.
2. Active Blueprint exists.
3. Provider, mode, source and degraded state are coherent.
4. Architectural decisions exist.
5. Required readiness checks before approval have no blockers.

An LLM Blueprint is valid only when `mode=llm`, `source=llm`, `degraded=false` and a canonical provider is present.
