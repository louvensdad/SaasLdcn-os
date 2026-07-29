# Event Contract

## Objetivo

Padronizar fatos imutáveis publicados pela plataforma.

## Campos mínimos

event_id, type, version, occurred_at, actor, organization_id, workspace_id, project_id, correlation_id e payload.

## Aceitação

- [ ] Eventos são versionados e idempotentes.
- [ ] Payload não vaza secrets.
- [ ] Consumidores podem reprocessar eventos.
