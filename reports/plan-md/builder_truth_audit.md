# Builder Truth Audit

## There are no per-vertical "builders"
CLAUDE.md advertises SaaS / Landing / Site / Blog / Portfolio / API / Frontend / Mobile /
E-commerce / Marketplace / Internal-System builders. **In code, these do not exist as distinct
builders.** What exists:

1. **Meta-Factory** (`engines/factory_pipeline.py`) — one generic LLM pipeline driven by the
   ProjectSpec. It does not branch per vertical; the "type of system" only influences the
   ProjectSpec text the agents read. (Real AI with a key; template skeleton without.)
2. **`engines/backend_generation_engine.py`** — **pure template engine.** `BACKEND_TEMPLATES`
   is a hardcoded dict (`fastapi-basic-api` with profiles basic/crud/auth/production, etc.).
   No LLM. It "generates" by rendering a fixed template and substituting names.
3. **`engines/local_generation_engine.py`** — **pure template engine** for static sites only:
   `ALLOWED_ARCHETYPES = {landing_page, portfolio, documentation_site}` → a single
   `STATIC_STACK_TEMPLATE = "static-site"` rendered via `TemplateRenderService`. It explicitly
   **blocks** real-app capabilities (`BLOCKED_CAPABILITIES = {ai_chat, rag, queue, websocket,
   realtime, kubernetes, docker, ci_cd}`). So "Landing/Portfolio/Docs builder" = one static
   template with text/entity substitution.

## Does a builder produce something unique?
- **Template engines (2 & 3):** No. They select a fixed template and swap text/entities.
- **Meta-Factory (1):** Yes *with a key* (the LLM authors files); No *without* (skeleton).

## Classification (template dependency)
- `backend_generation_engine`, `local_generation_engine`: **template-dominant (≈100%).**
- Meta-Factory no-key path: **template-dominant.**
- Meta-Factory with-key path: **template-light** (LLM-authored), though the agent prompts pin a
  fixed architecture (Clean Architecture, fixed folder layout) — a strong *opinion*, not a
  per-project template.

## Verdict
"Builders" is marketing. The honest map is: **one real AI pipeline (key-gated) + two static
template engines + one deterministic mock.** No SaaS/Blog/Marketplace/Dashboard builder is
implemented as such.

## UPDATE (audit follow-up #4)
The single AI pipeline is now **vertical-aware**: `ProjectSpec.system_type` carries the inferred
vertical (SaaS de saúde, Marketplace, E-commerce, …) into the Architect blueprint and the
Mega-Prompt, so the agents adapt to the domain. This is a **light, real opinion** — not 11
bespoke builders. The honest map is unchanged in shape; the AI path simply got domain context.
See `reports/audit_followups_1_4.md`.
