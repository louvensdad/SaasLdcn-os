# Execution Contract

## Objetivo

Representar qualquer build, tarefa de agente, teste, simulação ou operação de runtime.

## Entrada e saída

Entrada: versão, recursos, ferramentas e política. Saída: run_id, estado, artefatos, logs, métricas e erro estruturado.

## Autoridade

Scheduler agenda; Runtime Manager executa; Observability publica; usuário ou política cancela.

## Aceitação

- [ ] Estados são idempotentes e recuperáveis.
- [ ] Consumo de CPU, RAM, disco e tokens é medido.
- [ ] Execução pode ser cancelada com segurança.
