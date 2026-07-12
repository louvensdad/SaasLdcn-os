# Regras de validação da etapa Backend

`generation_job_engine._validate_stage` (estado `BACKEND_VALIDATING`).

## Princípio

A etapa Backend **não** exige projeto perfeito. Build e testes completos pertencem
às etapas `BUILD_RUNNING` / `TESTS_RUNNING`. Aqui só validamos que existe base
suficiente para a próxima etapa, classificando os warnings de forma explícita.

## Critérios de aprovação

O Backend (e demais etapas de geração) avança quando:

1. **Existência de artefatos** — há pelo menos um artefato `generated` válido cuja
   `stage` começa com o nome lógico da etapa (`backend`, `frontend`, `tests`,
   `docs`). Para `contracts` exige-se `openapi.*`; para `database`, um `.sql`.
2. **Sem erros reais** — nenhum `error`/`critical` entre os warnings classificados;
   uma etapa LLM sem nenhum arquivo extraível já falha antes, em `_run_llm_step`.
3. **Warnings classificados** — todos os warnings da etapa passam por
   `warning_policy.classify`. Apenas `blocking_warning/error/critical` bloqueiam.

Não exigimos: zero warnings, contagem específica de arquivos, OpenAPI re-sincronizado,
testes passando, build, contrato de frontend — nada disso pertence à etapa Backend.

## Três desfechos claros

| Situação | Desfecho | Status do job |
|----------|----------|---------------|
| Artefatos presentes + warnings não bloqueantes | continua | segue para a próxima etapa |
| Warnings bloqueantes (`blocking_warning`/`critical`) | para com diagnóstico | `NEEDS_USER_ACTION` |
| Erro estrutural (sem artefatos / sem arquivos extraíveis) | falha | `NEEDS_USER_ACTION` (`StageFailure`) |
| Hang (timeout da etapa) | para com diagnóstico | `STALLED` |
| Exceção inesperada | falha | `FAILED` |

Em todos os casos não-`continua`, o job nunca fica `running`: há sempre status
terminal-recuperável + diagnóstico.

## Relatório de validação persistido

`_validate_stage` grava `{stage}.validation.json` com:

```json
{
  "stage": "backend",
  "valid": true,
  "validator": "artifact_gate+warning_policy",
  "detail": "...",
  "warnings": { "breakdown": {...}, "blocking": false, "blocking_count": 0, "warning_count": 116, ... }
}
```

## Por que o print de 116 warnings não trava mais

Aqueles warnings são território/manifest/recuperação tolerante → classificados como
`info`/`warning` → `blocking_count = 0` → `valid = true` → a etapa **avança** para
`FRONTEND_PLANNING`.

## Anti-padrões eliminados (laços que esperavam algo que não vinha)

Auditados e confirmados como não bloqueantes nesta etapa:

- esperar zero warnings — agora classificados, não exigidos;
- exigir contagem específica de artefatos — só exigimos ≥1 válido;
- exigir OpenAPI re-sincronizado / contrato de frontend / build / testes antes da
  hora — movidos para suas etapas próprias;
- `await`/future que nunca resolve — coberto pelo watchdog de timeout (→ `STALLED`).

## Testes

`test_backend_with_non_blocking_warnings_advances`,
`test_backend_with_blocking_error_warning_is_blocked`,
`test_backend_with_critical_warning_is_blocked`,
`test_pipeline_advances_through_backend_to_frontend_and_completes`.
