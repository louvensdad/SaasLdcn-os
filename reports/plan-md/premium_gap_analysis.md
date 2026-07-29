# Premium Gap Analysis

## Already premium (real, keep)
- **LLM router + 5 supported adapters** (OpenAI/Anthropic/Google/DeepSeek/Groq) with a
  clean degrade contract (`served_by_fallback`/`degraded`). Genuinely good engineering.
- **Agent prompts** (`agent_prompts.py`) — production-grade, opinionated, integrity-enforcing.
- **Meta-Factory codegen pipeline (with key)** — emits complete, runnable files; manifest
  integrity rules; repair loop. This is the real crown jewel.
- **Security posture** — ephemeral encrypted key vault (TTL), zip-slip/path-traversal guards,
  secret scanning, owner isolation, audit log, export gating. Strong.
- **Honesty layer** — never fakes AI; always flags deterministic mode.

## Seems premium but isn't
- **PromptMaster.md** — looks like a pro spec; is a static template (≈98% identical no-key).
- **AI Project Room "chat"** — looks conversational; is spec-extraction + templated summary.
- **"8 specialist agents"** — is a 6-role pipeline; no Architect/DB/Security agents.
- **"11 builders"** — don't exist; one pipeline + two static template engines.
- **Modernize "deep AI analysis"** — deterministic scanner + heuristic scores; LLM optional/thin.
- **Quality scores** — heuristic formulas presented as analysis.

## What needs to exist (to match the promise)
1. **A configured default LLM** (server key or a guided first-run "bring your key") so the
   default experience is AI, not the mock.
2. **LLM-authored (or augmented) PromptMaster.md** — let the model write/expand sections, not
   just fill a template; make two different ideas produce visibly different documents.
3. **Real domain inference in the spec** (and a far stronger fallback) so entities/users/rules
   differ per business — the mock's hardcoded fields must go.
4. **A real architecture/blueprint step** between spec and codegen (the "Architect" agent the
   marketing claims).
5. **Per-vertical opinions** if "builders" stay in the pitch — or drop the claim.

## What should be removed / de-scoped
- Drop or relabel the "11 builders" and "8 agents" marketing until implemented.
- Stop presenting heuristic scores as "AI analysis"; call them a deterministic scan.
- The two static template engines (`backend_generation`, `local_generation`) overlap confusingly
  with the Meta-Factory — consolidate or clearly separate "template mode" vs "AI mode".
