# State Transition Finalizer — fim de pipeline sempre navegável (SKIPPED_AFTER_FAILURE)

Data: 2026-07-04 · Branch: feat/premium-foundation

## Incidente

Com o build em `SKIPPED_AFTER_FAILURE`, o backend terminava o pipeline
corretamente (READY degradado), mas o frontend ficava esperando um
BUILD_SUCCESS que nunca viria — tela congelada na etapa final, sem ação.

## Causas encontradas

1. **Nenhum evento final obrigatório**: o backend nunca emitia um sinal
   terminal explícito; o frontend dependia só do snapshot de status via SSE.
2. **`finishedAt` só era carimbado no caminho READY** — falha/stall/crash
   terminavam sem timestamp de fim.
3. **Stream SSE expirava em silêncio** após o orçamento de ticks (~30 min),
   sem frame final — o cliente não distinguia "acabou" de "morreu".
4. **Botão de reexecução de build quebrado no READY degradado**: o retry
   genérico usava `job.error?.stage ?? currentStage` = "READY", que o backend
   rejeita ("Etapa desconhecida"); e não havia export do código parcial.

## Implementação

### 1. State Transition Finalizer (backend)

`GenerationJobEngine._finalize_pipeline(job, owner, outcome, message)` — TODO
fim de pipeline passa por ele, nos 5 desfechos:

| desfecho | status | outcome |
|---|---|---|
| fluxo normal | READY | `SUCCESS` |
| build pulado | READY (partial) | `DEGRADED_CONTINUATION` |
| StageFailure | NEEDS_USER_ACTION | `NEEDS_USER_ACTION` |
| StageStalled | STALLED | `STALLED` |
| exceção inesperada | FAILED | `FAILED` |

Carimba `finishedAt` (agora em todos os caminhos) e emite o evento
**`pipeline_complete`** (PIPELINE_FINAL_EVENT) no console de execução — mesmo
com build falho, pulado ou testes incompletos. PAUSED é suspensão, não fim:
sem evento final (testado).

### 2. SSE nunca termina em silêncio

Ao esgotar o orçamento de ticks sem estado terminal, o stream agora emite um
frame final `{"type":"stream_timeout", ...}` antes de fechar.

### 3. Frontend — SKIPPED_AFTER_FAILURE = terminal-but-actionable

- `pipeline_complete` recebido no stream ⇒ refresh forçado do snapshot: a UI
  sempre aterrissa no estado final acionável.
- `BuildSkippedPanel` (modo DEGRADED_CONTINUATION): reexecutar build
  manualmente agora chama `retryJobStage(job.id, 'build', 'normal')`
  explicitamente (corrigido o caminho quebrado via currentStage=READY);
  novo botão **Exportar código parcial** (prepare-download com force +
  download); confirmar continuidade (`continue-after-build-skip`); guia de
  correção manual completo (causa raiz, arquivos, dependências, versões,
  passos, comandos, logs).
- **UI fallback (watchdog)**: qualquer job ativo sem sinal do backend por 45s
  mostra o banner "Sem sinal do backend" com botão **Continuar manualmente**
  (refresh imediato). A navegação nunca é bloqueada; não existe loading
  infinito — ou chega snapshot/evento, ou o fallback aparece.

## Testes (`tests/test_pipeline_final_event.py`, 7)

- `pipeline_complete` emitido em SUCCESS, DEGRADED_CONTINUATION,
  NEEDS_USER_ACTION, STALLED e FAILED (pipeline sempre termina com evento
  final) + `finishedAt` presente em todos;
- SKIPPED_AFTER_FAILURE não trava: termina READY (∈ TERMINAL_STATUSES, o
  conjunto que o frontend usa para encerrar o stream e liberar a UI);
- PAUSED não emite evento final;
- estado degradado permite continuar: retry manual explícito da etapa `build`
  aceito em READY degradado (reseta buildStatus para PENDING, conta o retry).

Frontend: typecheck limpo; lint sem erros novos.

## Critério de aceitação

- Sem tela congelada: evento final obrigatório + refresh no cliente + watchdog
  de 45s com "Continuar manualmente".
- Todo pipeline termina em estado navegável: os 5 desfechos finalizam com
  status terminal + `finishedAt` + `pipeline_complete`.
- SKIPPED não bloqueia UX: READY degradado com painel de continuação (retry
  manual, export parcial, confirmação, guia).
