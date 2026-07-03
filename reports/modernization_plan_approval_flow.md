# Modernization Plan — Approval Flow

**Engine:** `engines/modernization_plan_engine.py`.

## Phased plan
From the analysis, `build_plan` produces a `ModernizationPlan` of up to 5 phases:
1. **críticas** — remover .env/secret reais (auto), rotacionar segredos no código (manual).
2. **segurança** — .gitignore (auto), validação/rate limit, CORS/logs (manual, extra confirm).
3. **arquitetura** — separar camadas / remover duplicação (manual).
4. **testes** — criar estrutura de testes (manual).
5. **devops** — README, .env.example, health, scripts package.json (auto), Dockerfile/CI (manual).

Each `FixAction` carries `auto_fixable` and `requires_extra_confirmation`. Auto-fixable actions
use the auto-repair issue id so apply-fixes can match them on the materialized project.

## Approval gate — nothing changes without it
`POST /modernize/{id}/approve-plan {mode}`:
- `critical_only` → approves phases `critical` + `security`.
- `full` → all phases.
- `custom` → the given `phase_ids`.
Stores `approved_phase_ids`. **No files are touched at approval time.**

`POST /modernize/{id}/apply-fixes` returns **HTTP 409** if no approval exists, and only repairs
auto-fixable issues whose phase is in the approved set.

## Tests
`test_apply_fixes_requires_approval` (409 without approval); `test_full_pipeline_*` (approve →
apply). Audited: `modernization_plan_approved`.
