# Meta-Factory Repair — User Experience

**Goal:** the user should feel *"a Meta-Fábrica encontrou o problema, corrigiu, validou
novamente e deixou meu projeto pronto"* — not *"o sistema achou erro e jogou para mim"*.

## Backend ready (this pass)
The endpoints + contracts that power the experience are implemented and tested:
- `validate` / `quality-report` → `QualityGateReport` with severities, root cause, suggested fix
  and `auto_fixable` per issue.
- `repair` → `RepairResult` (what was fixed, diff summary).
- `revalidate` → `RevalidationResult` (what remains).
- `force-release` → conscious, audited override.
- Export/download blocked while BLOCKERS remain, with an actionable message.

## UI card "Validação e Correção" (NEXT pass — designed here)
States and controls the card will render from the contracts above:
- **Verificando** — "Estamos validando o projeto gerado." (spinner)
- **Falhou** — "A validação encontrou problemas." Buttons: **Corrigir automaticamente**
  (`repair`), **Rodar validação novamente** (`revalidate`), **Ver relatório** (issue list).
- **Corrigindo** — progress: analisando relatório → aplicando correções → atualizando arquivos
  → rodando testes → finalizando.
- **Aprovado** — "Projeto validado e pronto para entrega." Buttons: **Baixar ZIP**, **Exportar
  GitHub/GitLab** (only when `can_release`).
- Secondary **Liberar mesmo assim** → confirmation modal requiring `LIBERAR COM RISCO`.

## Honesty
Deterministic auto-repair fixes the safe class of problems; deeper issues (build, code-level
imports) are clearly labeled non-auto-fixable and routed to the heavy build "sala de teste".
The product never pretends a problem was fixed when it wasn't.
