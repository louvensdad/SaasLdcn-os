# Modelo físico inicial

## Convenções

- PostgreSQL.
- UUID como chave primária.
- `created_at`, `updated_at`, `deleted_at` nas entidades mutáveis.
- `organization_id` e `workspace_id` nas tabelas escopadas.
- Soft delete somente onde retenção e auditoria permitirem.
- JSONB para payloads versionados; tabelas relacionais para consultas críticas.

## Tabelas principais

### organizations

`id uuid pk`, `name text`, `slug text unique`, `status`, timestamps.

### workspaces

`id uuid pk`, `organization_id fk`, `name`, `slug`, `plan_id`, `status`, timestamps; unique `(organization_id, slug)`.

### projects

`id uuid pk`, `workspace_id fk`, `name`, `project_type`, `status`, `active_version_id`, timestamps; index `(workspace_id, status)`.

### project_files

`id uuid pk`, `project_id fk`, `version_id fk`, `path`, `content_hash`, `storage_key`, `size_bytes`; unique `(version_id, path)`.

### versions

`id uuid pk`, `project_id fk`, `parent_version_id fk`, `source`, `status`, `created_by`, `commit_ref`; index `(project_id, created_at desc)`.

### conversations e messages

Conversa pertence a projeto e workspace. Mensagem possui autor, papel, conteúdo, tokens, modelo, correlation_id e timestamp.

### executions

`id uuid pk`, `project_id`, `version_id`, `kind`, `status`, `idempotency_key unique`, `started_at`, `finished_at`, `error_code`.

### agent_runs

Execução de agente, capacidade, tarefa, ferramentas, tokens, custo, status e resultado.

### memories

Escopo, tipo, conteúdo, origem, confiança, retenção, embedding_ref, status e auditoria.

## Integridade

Foreign keys, checks de status, unique por tenant, índices de consulta por workspace/projeto e Row-Level Security para isolamento.

## Critérios de aceitação

- [ ] Queries sem escopo de tenant são rejeitadas pela camada de acesso.
- [ ] Exclusão lógica não quebra referências históricas.
- [ ] Auditoria registra mutações críticas.
- [ ] Migrações são versionadas e reversíveis quando possível.
