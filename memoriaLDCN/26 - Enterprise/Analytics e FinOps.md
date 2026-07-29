# Analytics e FinOps

## Objetivo

Medir uso, desempenho, qualidade, custo e valor gerado por projeto, workspace, agente, modelo, execução e deploy.

## Descrição completa

Inclui eventos de produto, telemetria técnica, dashboards, funis, retenção, custo por unidade, orçamento, forecast, anomalias e chargeback por equipe.

## Problema que resolve

Sem métricas, não é possível saber quais recursos geram valor, onde a IA custa caro ou por que uma execução ficou lenta.

## Fluxo

Evento → coleta → normalização → privacidade → armazenamento → agregação → dashboard → alerta ou decisão operacional.

## Dependências

Eventos, billing, observabilidade, identidade, data warehouse e consentimento.

## Relacionamentos

Conecta seleção de modelos, quotas, marketplace, produto, suporte e roadmap.

## Notas relacionadas

[[Catálogo de eventos]], [[Telemetria técnica]], [[Métricas de produto]], [[Custo por execução]], [[Feature Flags]]

## Critérios de aceitação

- [ ] Métricas possuem definição, origem e proprietário.
- [ ] Dados sensíveis são minimizados e governados.
- [ ] Workspace vê custo e consumo por projeto.
- [ ] Anomalias de custo e disponibilidade geram alerta.
- [ ] Eventos podem ser reprocessados sem duplicação.

## Prioridade

Alta

## Fase

Beta; FinOps completo em Enterprise.
