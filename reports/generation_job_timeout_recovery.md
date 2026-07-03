# GenerationJob — timeout de etapa e recuperação (STALLED)

## Objetivo

Nenhuma etapa pode ficar presa em `running` indefinidamente. Toda parada precisa
de explicação e de um caminho de recuperação.

## Watchdog de etapa

`generation_job_engine._route_with_timeout` envolve a chamada LLM (a única operação
que pode pendurar) num `ThreadPoolExecutor(max_workers=1)` e aguarda com
`future.result(timeout=self.stage_timeout_seconds)`.

- `STAGE_TIMEOUT_SECONDS = 1500` (25 min) — fica logo acima do pior caso legítimo do
  agente (3 tentativas × 6 min ≈ 18 min, `factory_pipeline.AGENT_TIMEOUT_MS`).
- Configurável por instância (`engine.stage_timeout_seconds`); os testes usam 0.2s.
- No timeout: `pool.shutdown(wait=False, cancel_futures=True)` — o teardown **não**
  espera a worker, então o engine retorna na hora em vez de pendurar junto. A thread
  órfã é limitada pelo `timeout_ms` do próprio adaptador.
- Espelha o padrão já usado em `iter_single_agent`, agora também no engine de job.

Estourou o teto → `StageStalled` → `execute()` marca:

- `status = "STALLED"` (novo estado, terminal-recuperável);
- `stageStatuses[logical] = "stalled"`;
- checkpoint `running` → `stalled` (com `finished_at` e `detail`);
- `error` = diagnóstico completo (`kind="stall"`).

## Persistência de checkpoint

O checkpoint `running` é salvo no repositório **antes** da chamada LLM
(`_run_llm_step`). Como a recuperação recarrega o job do banco, o checkpoint
travado é sempre encontrado e remarcado — nada se perde no stall/refresh.

## Diagnóstico obrigatório (`GenerationJobError`)

`stage`, `agent`, `provider`, `model`, `validator`, `attempt`, `kind`
(`failure`/`stall`), `reason`, `elapsed_seconds`, `timeout_seconds`, `last_log`,
`next_expected_transition`, `warning_count`, `error_count`, `blocking_count`,
`warning_breakdown`, `last_successful_checkpoint`, `last_generated_artifact`,
`artifacts_preserved`, `can_continue_with_warnings`, `recommended_action`,
`message`. Calculado em `_context_snapshot` a partir do estado persistido — idêntico
após refresh.

## Recuperação

| Ação | Rota | Efeito |
|------|------|--------|
| Reexecutar Backend | `POST /jobs/{id}/stages/{stage}/retry` (`mode=normal`) | Reinicia só a etapa, preserva checkpoints |
| Reexecutar particionado | mesma rota, `mode=partitioned` | Comprime contexto e refaz |
| Fallback determinístico | mesma rota, `mode=deterministic` | Fallback específico da etapa |
| Continuar com warnings | `POST /jobs/{id}/continue` (`continue_with_warnings`) | Aceita os warnings, marca etapa `success`, avança para a próxima etapa lógica |
| Último checkpoint | `POST /jobs/{id}/resume` | Retoma do último estágio |
| Trocar provider | UI → `/settings#llm` | Reexecuta com outro provider |
| Ver logs / diagnóstico | `GET /jobs/{id}/diagnostic` | Baixa checkpoints + logs |

`STALLED` entra no conjunto terminal do SSE (`/jobs/{id}/events`) e do
`TERMINAL` da UI, então o stream para de fazer polling e a tela mostra o painel de
recuperação em vez de um spinner infinito.

## Testes

- `test_backend_generating_never_runs_forever_marks_stalled` — timeout → `STALLED`,
  `currentStage=BACKEND_GENERATING`, `stageStatuses.backend=stalled`, checkpoint
  `stalled` preservado, `error.kind=stall`.
- `test_user_can_continue_with_warnings` — pula o restante do Backend e inicia o
  Frontend; etapa marcada `success`, status `QUEUED`.
