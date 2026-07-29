# Catálogo de eventos da plataforma

## Projeto

ProjectCreated, ProjectUpdated, BlueprintGenerated.

## Execução

BuildStarted, BuildFinished, AgentFinished, AgentFailed.

## Preview e deploy

PreviewStarted, PreviewStopped, DeployStarted, DeployFinished.

## IA e automação

PromptExecuted, MemoryUpdated, AutomationExecuted.

## Regras

Eventos são fatos imutáveis; comandos são solicitações. Consumidores nunca devem inferir estado somente pela ordem de chegada sem usar versão e timestamp.

## Aceitação

- [ ] Cada evento tem produtor e consumidores documentados.
- [ ] Reprocessamento não duplica efeitos.
- [ ] Mudanças de payload geram nova versão.

## Correspondência com a implementação real (gap aberto, 2026-07-19)

Nenhum destes nomes de evento existe literalmente no código hoje. A implementação atual usa um modelo genérico único, `ActivityEvent{category, action, status, correlation_id, severity, importance}`, em vez de eventos nomeados por categoria. `correlation_id` já existe, o que atende parcialmente à regra de rastreabilidade. Isso não foi resolvido nesta revisão — é uma lacuna de implementação real (não apenas de nome) que precisa de decisão: introduzir os eventos nomeados como uma camada semântica sobre o `ActivityEvent` existente, ou formalizar `category`/`action` como a taxonomia oficial e atualizar este catálogo para refletir os valores reais usados em produção.


Eventos de trial, assinatura, consumo e elegibilidade: [[Planos, assinaturas e controle de acesso]].
