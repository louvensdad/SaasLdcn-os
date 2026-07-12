# Project Room Audit

## Does the chat use a real LLM?
**Partially — and not as a "chat".**
- `services/project_room_service.py::post_message` → `engines/orchestrator_engine.py::run_orchestrator`
  → `LLMRouter.route` with `ORCHESTRATOR_SYSTEM_PROMPT`. So a turn **does** call a real LLM…
  **only when a key is present**; otherwise it falls to `MockAdapter` (`degraded=True`).
- It is **not a conversational chat.** Each user message re-runs the orchestrator to produce a
  structured `ProjectSpec`. The assistant's visible reply is **not** LLM prose — it is a
  deterministic, templated summary built in `_summary()` (e.g. "Identifiquei N perfis, N
  entidades, N regras. Confiança: P%."). There is no free-form LLM dialogue.

| Aspect | Reality |
|---|---|
| Chat reply text | Deterministic template (`_summary`) — never LLM-authored |
| Idea → spec | LLM (orchestrator) **if key**, else deterministic mock |
| Provider/model | from `MODEL_REGISTRY` + user choice; key from RAM vault |

## Does the PromptMaster.md come from AI?
**No — the document is 100% deterministic, always.**
`engines/prompt_master_md_engine.py::build_prompt_master_md` is a pure templated renderer: it
fills ~32 fixed Markdown sections from `ProjectSpec` fields plus boilerplate (security,
observability, i18n, etc. are constant strings). The LLM never sees or writes the `.md`. The
only AI contribution is the *spec values* it interpolates — and only when a key is present.

Generating functions: `build_prompt_master_md`, `_section_bodies`, `_modules`, `_permissions`,
`_security`, `_acceptance`, `_folder_structure`, `_expected_files` — all deterministic.

## Is the PromptMaster actually unique? (measured)
Ran the audit's own test through the **default (no-key) path** — CRM odontológico vs Depósito
de cana vs Marketplace de tratores:

| Pair | PromptMaster.md similarity |
|---|---|
| A vs B | **97.9%** |
| A vs C | **97.9%** |
| B vs C | **97.5%** |

`target_users`, `business_rules`, `core_workflows`, `non_functional` were **identical** across
all three; `entities` collapsed to `["Item","User"]` for all three (regex failed on Portuguese
nouns); stack was `python/fastapi` for all. **Without a key, the PromptMaster is ~98% the same
no matter the idea.** With a key, the spec (and thus the interpolated values) would genuinely
differ — but the document scaffold stays identical by construction.

## Verdict
The Project Room is a **structured spec extractor with a templated transcript and a templated
document**, fronted by an optional LLM. It is closer to "intelligent form-filling + template"
than to "an AI architect conversation" — and entirely template in the default state.
