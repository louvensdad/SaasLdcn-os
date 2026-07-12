# Meta-Factory — política de warnings

Módulo: `apps/api/app/engines/warning_policy.py`.

## Problema

Cada arquivo gerado herdava a lista inteira de warnings do parser
(`warnings=list(parsed.warnings)`), produzindo "valid — 116 warning(s)" em todos
os artefatos. Não havia regra dizendo quais warnings importam, então o pipeline não
conseguia decidir entre continuar e parar — e ficava preso.

## Cinco níveis

| Nível              | Bloqueia? | Exemplos |
|--------------------|-----------|----------|
| `info`             | não       | TODO, cobertura parcial, documentação, traceability, manifest sintetizado, território, recuperação por parser tolerante |
| `warning`          | não       | qualquer warning não reconhecido (default — favorece progresso) |
| `blocking_warning` | **sim**   | "No FILE blocks", contrato/OpenAPI ausente, build falhou, erro de compilação/sintaxe, import não resolvido |
| `error`            | **sim**   | "unrecoverable error", "fatal" |
| `critical`         | **sim**   | segredo/credencial hardcoded, vulnerabilidade, SQL injection, RCE, "critical" |

Regra única do pipeline:

```
info | warning            -> NÃO bloqueia  (continuar)
blocking_warning          -> bloqueia      (NEEDS_USER_ACTION)
error | critical          -> bloqueia      (NEEDS_USER_ACTION / FAILED)
```

`BLOCKING_LEVELS = {blocking_warning, error, critical}`.

## API

- `classify_one(warning: str) -> str` — nível de um warning. Ordem de precedência:
  critical → blocking_warning → info → error → `warning` (default). Desconhecido
  cai em `warning` (não bloqueante): o pipeline prefere avançar; sinais realmente
  perigosos precisam casar um padrão explícito de bloqueio/crítico.
- `classify(warnings) -> WarningClassification` com:
  - `breakdown` (contagem por nível),
  - `blocking` / `blocking_count`,
  - `warning_count` (volume advisory = info + warning + blocking_warning),
  - `error_count` (error + critical),
  - `blocking_messages`,
  - `as_dict()` para serialização no diagnóstico.

## Por que documentação/cobertura/TODO/território não bloqueiam

São governança/qualidade, não corretude estrutural. Um controller correto que usa
o layout idiomático de um projeto single-stack "fora do território monorepo", ou um
`traceability.md` com TODOs, **não pode matar a geração**. Apenas problemas
estruturais (sem arquivos, contrato ausente, build/compilação) e criticais de
segurança bloqueiam por padrão.

## Onde é usado

- `_validate_stage`: classifica os warnings dos artefatos `generated` da etapa e
  decide o gate.
- `_run_llm_step`: anota no checkpoint `warnings=N (bloqueantes=M)`.
- `_context_snapshot`: alimenta `warning_count`, `error_count`, `blocking_count` e
  `warning_breakdown` do diagnóstico.

## Testes

`test_warning_policy_classifies_common_warnings_as_non_blocking` (≈120 warnings do
print → 0 bloqueantes) e `test_warning_policy_flags_security_and_structural_as_blocking`.
