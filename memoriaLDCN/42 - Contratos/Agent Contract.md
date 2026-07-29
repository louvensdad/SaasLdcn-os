# Agent Contract

## Objetivo

Padronizar agentes como unidades executáveis com capacidades declaradas.

## Entrada e saída

Entrada: tarefa, contexto, artefatos, restrições e ferramentas permitidas. Saída: resultado estruturado, arquivos, eventos, métricas, riscos e handoff.

## Autoridade

Orchestrator Engine agenda; agente só modifica recursos autorizados; QA e Revisor validam.

## Aceitação

- [ ] Capacidades, permissões, timeout e formato de saída declarados.
- [ ] Execução é rastreável e cancelável.
- [ ] Falhas possuem código e tentativa de recuperação.
