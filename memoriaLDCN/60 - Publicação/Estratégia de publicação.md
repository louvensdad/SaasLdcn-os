# Estratégia de publicação

## Ambientes

- Preview temporário: sandbox, URL curta e expiração.
- Staging: ambiente persistente para aprovação.
- Produção gerenciada: infraestrutura operada pelo MLTagente.
- Produção externa: destino do cliente.
- Exportação Docker: imagem e configuração reproduzíveis.
- Exportação de código: arquivos e documentação sem dependência do MLTagente.

## Fluxo

Versão aprovada → secrets e variáveis → build → migrations → deploy → health check → domínio/SSL → monitoramento → rollback.

## Critérios de aceitação

- [ ] Migrations possuem estratégia segura.
- [ ] SSL, domínio e variáveis são verificáveis.
- [ ] Rollback aponta para versão anterior conhecida.
- [ ] Zero downtime é declarado como suportado ou não por destino.
