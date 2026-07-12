# GenerationJob e state machine

## Persistência

`generation_jobs` armazena owner, projeto, payload de entrada redigido e o snapshot completo do job. O snapshot contém status, etapa atual, provider/model, versão do Blueprint, progresso, erro, retries, logs, artefatos, checkpoints e status lógico por etapa.

## Estados

São suportados `QUEUED`, `PREPARING_CONTEXT`, os estados planning/generating/validating de Contracts, Database, Backend e Frontend, Security, Tests, Documentation, Build, Package, além de `READY`, `FAILED`, `PAUSED` e `NEEDS_USER_ACTION`.

Cada transição é persistida antes do trabalho. Cada conclusão atualiza checkpoint, progresso e timeline. Falha esperada produz `NEEDS_USER_ACTION`; falha inesperada produz `FAILED`. Ambos mantêm `partial=true`, `valid=false` e `packageReady=false`.

## Retomada

- `resume`: continua da etapa/checkpoint atual.
- `retry stage`: volta somente à etapa lógica solicitada e segue adiante.
- `pause`: interrupção cooperativa entre etapas, sem apagar progresso.
- leitura é owner-scoped.
