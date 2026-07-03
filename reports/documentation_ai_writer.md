# Documentation AI Writer

`app/engines/documentation_ai_writer.py` — generates the minimum documentation set from a
project's **real sources**, with an honest deterministic fallback. Generation is a *preview*;
nothing is written until the user approves it.

## Sources of truth
Knowledge is mined from the project record and files (never invented):
- Blueprint → `project_requirements` (goal, context, users, rules, entities, workflows,
  constraints), `technology_graph` (language/runtime/framework/architecture),
  `architecture_profile`, `archetype`, `capabilities`, `business_modules`, `endpoints`.
- PromptMaster / Architecture Review presence is recorded in `sources`.
- Generated project files (detected paths: tests, Dockerfile/compose, …).

## Minimum documents
`README.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/SECURITY.md`,
`docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/adr/0001-initial-architecture.md`.

## LLM vs deterministic (honest)
- `ai_active = (user api_key present) OR a server provider is configured` (`ai_availability`).
- When active, each document is written by the configured provider via `LLMRouter`
  (`agent_role="documentation"`, JSON `{content}` schema). The system prompt asks for
  senior-engineer, project-specific Markdown with justified decisions and concrete examples.
- The mock fallback returns generic text, so a `served_by_fallback` (or `LLMError`) result is
  treated as **deterministic** — the writer builds the doc from real data instead, and never
  surfaces mock output as "AI".
- Deterministic documents are prefixed with `> _Preview determinístico …_` and tagged
  `mode = "deterministic"`; LLM documents are tagged `mode = "llm"` (UI shows an `LLM` or
  `Deterministic preview` badge per document).

## Preview → approve → save
- `generate()` returns previews only (in memory).
- `save()` writes the approved documents (copy-to-docs: README at root, others under `/docs`,
  ADR under `docs/adr/`). It **does not overwrite** an existing file unless `overwrite=True`.

## Endpoints
- `POST /projects/{id}/documentation/generate` `{ doc_ids?, use_user_key?, user_model_choice? }`
- `POST /projects/{id}/documentation/save` `{ docs: [{id, content}], overwrite? }`

Both resolve the caller's own LLM key from the ephemeral key session when `use_user_key` is set
(mirrors the meta-factory pattern); LLM errors return a generic 502 with a correlation id.

## Tests
`apps/api/tests/test_documentation_ai_writer.py` (8): deterministic fallback honesty, LLM mode
via stub router, secret redaction, single-doc regeneration, save+validate, no-overwrite-without-
confirmation, sanitize-on-save, and a generate+save route smoke test. Full suite: 323 passed.
