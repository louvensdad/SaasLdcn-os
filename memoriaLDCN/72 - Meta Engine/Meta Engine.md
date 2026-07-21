# Meta Engine

> Nome oficial atual: **Meta-Factory** (ver [[Glossário oficial do MLTagente]], correspondência com implementação real registrada em 2026-07-19 — `apps/api/app/routes/meta_factory.py`). Mantido "Meta Engine" no título deste arquivo por estabilidade de referências internas do vault; o conceito é o mesmo.

## Objetivo

Coordenar os motores estratégicos da plataforma e decidir qual ciclo executar, interromper, repetir ou devolver ao usuário.

## Motores coordenados

- Blueprint Engine
- Planning Engine
- Orchestrator Engine
- Generation Engine
- Runtime Engine
- Intelligence Engine
- Evolution Engine

## Responsabilidades

- Interpretar o estado global.
- Selecionar o próximo motor.
- Verificar pré-condições e contratos.
- Controlar retries, checkpoints e compensações.
- Detectar bloqueios e pedir decisão ao usuário.
- Encerrar o ciclo com evidência de sucesso ou falha.

## Orchestrator versus Meta Engine

O Orchestrator coordena agentes, tarefas e ferramentas dentro de um plano. A Meta Engine coordena os motores e ciclos da plataforma inteira.

## Fluxo

Estado → política → motor elegível → execução → evento → reavaliação → próximo motor ou aprovação.

## Critérios de aceitação

- [ ] Nenhum motor é chamado sem contrato e pré-condições.
- [ ] Ciclo pode pausar e retomar por checkpoint.
- [ ] Repetições têm limite e motivo.
- [ ] Bloqueios são apresentados ao usuário com alternativas.
