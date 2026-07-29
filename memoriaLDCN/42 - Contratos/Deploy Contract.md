# Deploy Contract

## Objetivo

Definir publicação de uma versão em ambiente externo.

## Entrada e saída

Entrada: versão aprovada, destino, configuração e aprovação. Saída: deploy_id, URL, ambiente, health check, logs e rollback.

## Autoridade

Deploy Engine executa segundo política; usuário ou aprovação Enterprise autoriza produção.

## Aceitação

- [ ] Deploy aponta para versão imutável.
- [ ] Health check e rollback são obrigatórios.
- [ ] Secrets não aparecem no contrato ou logs.
