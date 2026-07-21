# Scheduler Global

## Objetivo

Agendar builds, automações, deploys, backups, sincronizações, limpeza de ambientes e tarefas internas.

## Fluxo

Criar schedule → validar timezone e política → enfileirar no horário → obter recurso → executar → emitir evento → retry ou concluir.

## Dependências

Filas, workers, recursos, billing, runtime, automações e confiabilidade.

## Aceitação

- [ ] Agendamentos são idempotentes.
- [ ] Fuso horário e horário de verão são suportados.
- [ ] Execuções perdidas possuem política explícita.
- [ ] Usuário pode pausar, editar e auditar schedules.
