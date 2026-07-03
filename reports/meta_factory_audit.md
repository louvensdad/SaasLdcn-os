# Meta-Factory Audit

## Pipeline
`engines/factory_pipeline.py` runs a fixed role sequence: **contracts → backend → frontend →
qa → devops → docs** (`PIPELINE_ORDER`). Each role is one LLM call: system =
`AGENT_PROMPTS[role]` (`engines/agent_prompts.py`), user = the compiled Mega-Prompt from the
ProjectSpec. Output is parsed by `services/file_protocol.py` (`<<<FILE>>>` blocks) and written
to disk by `ProjectWriter`.

Note: the spec's named agents Architect / Database / Security are **not** separate agents.
Reality = 6 roles. "Architect" ≈ the orchestrator/contracts step; "Database" + "Security" are
folded into the backend agent's prompt rules; there is no standalone DB or Security agent.

## Per role
| Agent | Real LLM call? | Prompt | Output | Generates code? |
|---|---|---|---|---|
| contracts | Yes (key) / mock | `CONTRACTS_SYSTEM_PROMPT` | `openapi.yaml` | Yes |
| backend | Yes (key) / mock | `BACKEND_SYSTEM_PROMPT` (+ rules + integrity) | layered source, .env.example, deps, traceability | Yes |
| frontend | Yes (key) / mock | `FRONTEND_SYSTEM_PROMPT` | components, repos, MSW | Yes |
| qa | Yes (key) / mock | `QA_SYSTEM_PROMPT` | tests, postman, security_review.md | Yes |
| devops | Yes (key) / mock | `DEVOPS_SYSTEM_PROMPT` | Dockerfile, compose, k8s, CI | Yes |
| docs | Yes (key) / mock | `DOCS_SYSTEM_PROMPT` | README, ARCHITECTURE.md | Yes |

- **Provider/model:** chosen per `user_model_choice` or default role hints; one provider per run.
- **With a key:** these are real, well-prompted codegen agents that emit real, complete files
  (the prompts forbid ellipses/TODOs and enforce manifest integrity). This is the strongest,
  most genuine part of the platform.
- **Without a key:** every agent is served by `MockAdapter._build_role_files` — fixed per-stack
  skeletons with the entity name substituted. Files are produced (so the pipeline "works"), but
  they are templates, flagged `degraded`.

## Does an agent generate code or just metadata?
Generates **code** (real files written), in both modes. The difference is *authorship*: LLM
(key) vs template (no key).

## Verdict
The Meta-Factory is a legitimate multi-agent LLM codegen pipeline **when a key is present**.
The agent design and prompts are production-grade. The weakness is the same as everywhere: with
no key it is a deterministic skeleton generator, and the "8 specialist agents" marketing
overstates a real 6-role pipeline.
