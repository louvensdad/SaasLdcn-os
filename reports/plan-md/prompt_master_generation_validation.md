# PromptMaster.md — Generation Validation

**Engine:** `apps/api/app/engines/prompt_master_md_engine.py` (`build_prompt_master_md`)

## Design
- **Deterministic and pure.** It never calls an LLM — the model already ran upstream
  in the orchestrator. Input is a `ProjectSpec`; output is the full Markdown document
  plus a section index, version number, timestamp and `degraded` flag.
- When the upstream turn was served by the deterministic mock (`degraded=True`), the
  document is prefixed with an explicit **"⚠️ Modo Determinístico"** banner — the
  product never pretends a real model authored the spec.

## Mandatory sections (all present, in order)
Visão Geral · Objetivo do Projeto · Problema Resolvido · Público-Alvo · Tipo de Sistema ·
Módulos · Usuários · Permissões · Regras de Negócio · Fluxos Principais · Entidades ·
Campos · Integrações · Banco de Dados · Backend · Frontend · APIs · Segurança ·
Autenticação · Observabilidade · Auditoria · Testes · Documentação · Responsividade ·
Internacionalização · Escalabilidade · Critérios de Aceite · Estrutura de Pastas ·
Arquivos Esperados · Roadmap · Regras de Geração · **O que NÃO deve ser gerado**.

## Derivation rules (from ProjectSpec)
- **Tipo de Sistema** inferred from intent keywords (SaaS, CRM, ERP, marketplace, e-commerce, API, mobile…).
- **Módulos** derived from `entities` + `core_workflows` (+ RBAC, Dashboard, Pagamentos when relevant).
- **Usuários / Permissões** from `target_users`; first user → admin scope.
- **Segurança / Escalabilidade / Backend** seeded from `non_functional` and `suggested_stack`
  (the stack is preserved, never substituted).
- **Critérios de Aceite** from `business_rules` + `core_workflows` + auth gates.

## Test evidence (`tests/test_project_rooms.py`)
- `test_generate_prompt_master_has_all_sections` — asserts every mandatory section
  header is present in the compiled Markdown, version == 1.
- `test_generate_prompt_requires_spec_first` — generating before any idea → HTTP 409.
- `test_deterministic_mode_is_flagged_not_faked` — `degraded=True`, banner present,
  version flagged degraded.

## Smoke ("quero um SaaS para clínica")
`POST /message` → spec produced → `POST /generate-prompt` → PromptMaster.md with all
sections, "Tipo de Sistema: SaaS (software como serviço)" inferred deterministically.

**Result:** generation validated. ✅
