# PromptMaster Quality Audit

## How it is produced
`build_prompt_master_md(spec, degraded, version)` (`engines/prompt_master_md_engine.py`) renders
a **fixed 32-section Markdown template**, interpolating `ProjectSpec` fields. ~Half the sections
(Segurança, Observabilidade, Auditoria, Responsividade, i18n, Escalabilidade, Regras de Geração,
"O que NÃO gerar") are **constant boilerplate** independent of the idea. The LLM never authors
the document; at best it authored the spec that feeds it.

## Measured uniqueness (default / no-key path, the audit's own test)
| Pair | Similarity |
|---|---|
| CRM odontológico vs Depósito de cana | 97.9% |
| CRM odontológico vs Marketplace de tratores | 97.9% |
| Depósito de cana vs Marketplace de tratores | 97.5% |

Identical across all three: `target_users`, `business_rules`, `core_workflows`,
`non_functional`. `entities` → `["Item","User"]` for all (the inference regex
`\b([A-ZÁÉ…][a-zá-ú]{2,})\b` does not extract domain nouns from "clínica odontológica",
"depósito de cana", "marketplace de tratores"). Stack → `python/fastapi` for all.

## Interpretation
- **No-key:** the PromptMaster is effectively a single template with the raw idea pasted in.
  Not unique, not intelligent. ~98% identical.
- **With-key:** `ProjectSpec` would genuinely differ per idea (the orchestrator prompt is good),
  so interpolated values differ — but the document's structure, boilerplate sections and overall
  shape stay identical, so two real projects would still share a large constant skeleton.

## Concrete weaknesses to fix (root cause)
1. The document should be **LLM-authored or LLM-augmented**, not a static template, if it is to
   feel like an architect's spec. Today the LLM stops at the spec.
2. The mock spec's hardcoded `target_users`/`business_rules`/`workflows` make the no-key demo
   indefensible for a product that sells "the AI understands your business".
3. Entity/stack inference in the mock is too weak even as a fallback (fails on PT-BR nouns).

## Verdict
The PromptMaster is **a professional-looking template**. Its intelligence is entirely upstream
(spec extraction) and entirely absent without a key.
