# API Pública e ecossistema

## Objetivo

Expor capacidades estáveis do MLTagente para integrações externas, SDKs, webhooks, eventos e automações de clientes.

## Descrição completa

O domínio deve possuir versionamento, documentação OpenAPI, chaves e OAuth, escopos, idempotência, paginação, rate limit, webhooks assinados, sandbox para desenvolvedores, changelog e política de depreciação.

## Problema que resolve

Impede que integrações dependam de endpoints internos instáveis e permite que o MLTagente seja plataforma, não apenas aplicação fechada.

## Fluxo

Aplicação registra → recebe credencial → solicita escopo → chama API → evento é emitido → webhook é entregue → falha é retentada → integração é auditada.

## Dependências

Gateway, identidade, auditoria, eventos, rate limit, documentação e sistema de plugins.

## Relacionamentos

Integra com SDK, CLI, automações, marketplace, Git providers, billing e observabilidade.

## Notas relacionadas

[[Contrato da API Pública]], [[Sistema de Webhooks]], [[Catálogo de Eventos]], [[SDK do MLTagente]], [[Rate Limit e anti abuso]]

## Critérios de aceitação

- [ ] Toda API pública possui versão e contrato publicado.
- [ ] Webhooks têm assinatura, retry, replay e dead letter.
- [ ] Tokens têm escopo, expiração e revogação.
- [ ] Consumidores veem métricas e erros de suas integrações.

## Prioridade

Alta

## Fase

Beta; SLAs e programa de parceiros em Enterprise.
