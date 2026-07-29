# Git Export — Blocker Handling

## Rule
Git export and download are blocked when the Quality Gate has **BLOCKERS**, unless a conscious
force-release override is on the project. Enforced in `routes/meta_factory.py::_require_verified`
(used by both `prepare-download` and `_export_generated_project`):

1. `force=True` (explicit "mesmo assim" param) → allow.
2. Evaluate the Quality Gate (deterministic, fast, no build).
3. `release_override` on the project → allow (conscious force-release, already audited).
4. `blocker_count > 0` → **HTTP 409** with an actionable message
   ("Exportação bloqueada porque ainda existem N problema(s) crítico(s). Corrija
   automaticamente, rode a validação novamente ou veja os problemas.") + audit `git_export_blocked`.
5. Otherwise fall through to the existing build-verification ("sala de teste") gate.

The high/critical security-finding block already present in `_export_generated_project`
remains, so secrets never reach Git.

## Why this is correct
- The message is **actionable**, not generic — it points at Corrigir / Revalidar / Ver problemas.
- The same gate guards both ZIP download and Git export, so there is one source of truth.
- A project only exports when it is genuinely releasable (no blockers) or the user consciously
  overrode it (`force-release`, see `force_release_safety.md`).

## Tests
`test_export_gate_blocks_on_blockers_and_allows_after_force_release`: a project with blockers →
`_require_verified` raises 409; after `set_release_override` → it passes. The block path audits
`git_export_blocked`.

## Next pass (UI)
The web export panel will surface the blocked state with **Corrigir automaticamente / Rodar
validação novamente / Ver problemas** buttons instead of a generic message.
