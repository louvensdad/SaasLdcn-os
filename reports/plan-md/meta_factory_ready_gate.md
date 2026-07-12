# Meta-Factory READY Gate — nunca liberar projeto quebrado

Data: 2026-07-03 · Branch: feat/premium-foundation

## Regra

Um GenerationJob só vira **READY** quando TODAS as condições valem:

1. **install passou** — `BuildValidationReport.installed == "passed"` (após o
   Dependency Registry e o Build Auto-Repair loop);
2. **build passou** — `built == "passed"` (npm run build / tsc / mvn / gradle /
   go / cargo / dotnet / composer, conforme o ecossistema);
3. **typecheck** — coberto pelo caminho `tsc --noEmit` quando não há script de
   build, e pelo próprio build nas linguagens compiladas;
4. **testes mínimos** — estágio TESTS_RUNNING valida artefatos de teste reais
   (warning policy bloqueia ausências classificadas como bloqueantes);
5. **dependências validadas** — `dependency.validation.json` sem bloqueio +
   dependency audit do relatório de validação;
6. **artefatos gerados** — `_build` exige arquivos válidos; `_package` exige
   `job.valid == True` e `generatedProjectId`.

## Como o gate é aplicado (código)

- `generation_job_engine._build`: se `report.passed`/`report.build.ok` falham
  (ou o build foi pulado), levanta `StageFailure` → status
  **NEEDS_USER_ACTION** (recuperável, o equivalente operacional de
  NEEDS_REPAIR/FAILED_RECOVERABLE), com diagnóstico classificado (causa raiz,
  correção sugerida, patches já aplicados). `job.valid` permanece `False`,
  `packageReady` `False`, `partial` `True`.
- `generation_job_engine._package`: bloqueia o pacote se `valid == False` —
  não existe caminho para READY sem build aprovado.
- READY só é atribuído ao final do loop de steps, depois de `_build` e
  `_package` concluírem sem exceção.
- Download/export de projeto continuam atrás de `_require_verified` (quality
  gate + verificação de build), com o único override sendo o consciente
  "LIBERAR COM RISCO" (auditado).

## UI

- Status NEEDS_USER_ACTION/FAILED nunca renderiza o painel "pronto para
  download"; o card de falha mostra a causa classificada e as ações de
  recuperação (corrigir automaticamente / reexecutar / fallback / diagnóstico).
- O badge "Artefato válido" só aparece com `partial == false`.

## Testes

- `test_broken_project_never_becomes_ready` — `_package` com `valid=False`
  levanta `StageFailure`;
- `test_failed_build_report_marks_generation_not_passed` — build reprovado ⇒
  `GenerationValidationReport.passed == False`;
- suíte existente já cobria: package bloqueado sem build válido, força de
  release exigindo frase exata, `_require_verified` bloqueando export.

Suíte completa do backend após as mudanças: **675 passed, 1 skipped**.
