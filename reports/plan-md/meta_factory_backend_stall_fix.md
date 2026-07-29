# Meta-Factory — correção do travamento na etapa BACKEND_GENERATING

## Sintoma

O `GenerationJob` parava em `BACKEND_GENERATING` (progresso ~55%, status
`running`) com artefatos válidos porém cheios de warnings (ex.: `docs/traceability.md
— valid — 116 warning(s)`). A etapa nunca avançava para `FRONTEND_GENERATING` e o
status permanecia eternamente `running`, sem explicação.

## Causas-raiz

1. **Sem timeout por etapa.** `GenerationJobEngine.execute()` chamava
   `_run_agent(...)` de forma síncrona, na própria thread do job. Diferente do
   caminho de streaming (`iter_single_agent`, que já envolvia a chamada num
   `ThreadPoolExecutor` com `future.result(timeout=...)`), o engine de job **não
   tinha watchdog**. Se o adaptador do provider ignorasse o próprio `timeout_ms`
   (socket preso, stream que não fecha, `await` que nunca resolve), a thread
   bloqueava para sempre e o status ficava `running` indefinidamente. Backend tem
   12 chunks sequenciais de LLM — qualquer um pendurado travava tudo.

2. **Warnings sem classificação / sem regra de decisão.** Cada arquivo emitido
   recebia a lista inteira de warnings do parser (`warnings=list(parsed.warnings)`),
   por isso "valid — 116 warning(s)" em todo artefato. Esses warnings eram quase
   todos *advisory* (território, manifest sintetizado, recuperação tolerante,
   TODO, cobertura, documentação), mas o pipeline não tinha nenhuma regra dizendo
   "isto não bloqueia". Faltava a separação `info | warning | blocking_warning |
   error | critical`.

3. **Sem estado intermediário recuperável.** Só existiam `FAILED` e
   `NEEDS_USER_ACTION`. Um hang não era nem falha nem ação — virava `running`
   perpétuo.

## Correções

- **Watchdog de etapa** (`_route_with_timeout`): a chamada LLM roda numa worker
  thread sob um teto rígido (`STAGE_TIMEOUT_SECONDS = 1500s`, configurável via
  `engine.stage_timeout_seconds`). Estourou → `StageStalled` → job vira `STALLED`,
  checkpoint preservado, diagnóstico completo. Nenhuma etapa pode mais ficar
  `running` para sempre. Veja `generation_job_timeout_recovery.md`.

- **Política de warnings** (`app/engines/warning_policy.py`): classifica cada
  warning em cinco níveis; só `blocking_warning/error/critical` bloqueiam. Os 116
  warnings do print caem em `info`/`warning` e **não travam mais**. Veja
  `meta_factory_warning_policy.md`.

- **Gate de validação reescrito** (`_validate_stage`): além de exigir artefatos,
  classifica os warnings da etapa e decide claramente — continuar, `NEEDS_USER_ACTION`
  (warnings bloqueantes) ou `FAILED` (erro real). Veja
  `backend_stage_validation_rules.md`.

- **Checkpoint persistido antes da chamada LLM**: o checkpoint `running` é salvo
  no repositório antes do request, então a recuperação (que recarrega do banco)
  sempre o encontra e o marca `stalled`.

- **Diagnóstico obrigatório**: `jobId`, `projectId`, `currentStage`,
  `last_successful_checkpoint`, `last_generated_artifact`, `warning_count`,
  `error_count`, `blocking_count`, `validator`, `provider`, `model`,
  `elapsed_seconds`, `last_log`, `next_expected_transition` e `reason` — todos no
  payload de erro (`GenerationJobError`).

- **Recuperação pelo usuário**: nova rota `POST /meta-factory/jobs/{id}/continue`
  (`continue_with_warnings`) aceita os warnings da etapa, marca-a `success` e avança
  para a próxima etapa lógica. Mais reexecução normal/particionada/determinística e
  retomada do último checkpoint, já existentes.

- **UI** (`resilient-pipeline.tsx`): `STALLED`/`stalled` renderizados como estado
  próprio (tom warning, ícone de relógio), painel com resumo (gerados, válidos,
  warnings, bloqueantes, próximo passo) e botões *Reexecutar Backend*, *Continuar
  com warnings*, *Reexecutar particionado*, *Fallback determinístico*, *Último
  checkpoint*, *Trocar provider*, *Ver logs/diagnóstico*.

## Regras de avanço do Backend

A etapa avança quando: estrutura/módulos base gerados, contratos mínimos presentes,
artefatos persistidos, sem erros críticos e warnings classificados como não
bloqueantes. Build e testes completos pertencem a etapas posteriores — o Backend
não precisa estar perfeito aqui.

## Testes

`apps/api/tests/test_generation_job_pipeline.py` (todos verdes):

1. Warnings comuns (≈120) classificados como não bloqueantes.
2. Segurança/estrutura classificadas como bloqueantes.
3. Backend com warnings não bloqueantes **avança**.
4. Backend com warning de `error` **bloqueia**.
5. Backend com `critical` **bloqueia**.
6. `BACKEND_GENERATING` nunca fica `running` infinito → `STALLED` no timeout.
7. Checkpoint preservado no stall.
8. Usuário continua com warnings (pula para Frontend).
9. Progresso monotônico, termina em 100.
10. Próxima etapa (Frontend) inicia após Backend válido; pipeline conclui.
