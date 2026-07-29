# Matriz de rastreabilidade

## Objetivo

Garantir que cada requisito seja convertido em especificação, persistência, API, evento, teste e critério de aceitação.

## Matriz inicial

| Requisito | Prompt.md | Blueprint | Endpoint | Entidade | Evento | Teste | Critério |
|---|---|---|---|---|---|---|---|
| Criar projeto | `project.definition` | `project.definition` | `POST /projects` | `projects` | `ProjectCreated` | `create-project.e2e` | Projeto criado no workspace |
| Aprovar Prompt.md | `prompt.approval` | `source_prompt_id` | `POST /prompts/{id}/approve` | `prompts` | `PromptApproved` | `approve-prompt.integration` | Prompt aprovado pelo usuário |
| Gerar Blueprint | `blueprint.generation` | `blueprint` | `POST /projects/{id}/blueprints` | `blueprints` | `BlueprintGenerated` | `generate-blueprint.integration` | Blueprint válido |
| Iniciar build | `build.execution` | `builds` | `POST /builds` | `builds` | `BuildStarted` | `start-build.integration` | Build enfileirado |
| Finalizar build | `build.execution` | `builds` | `GET /builds/{id}` | `builds` | `BuildFinished` | `build-success.e2e` | Artefato produzido |
| Abrir preview | `preview.execution` | `preview` | `POST /previews` | `previews` | `PreviewStarted` | `preview-start.e2e` | URL acessível |
| Alterar projeto | `change.request` | `version.diff` | `POST /projects/{id}/changes` | `versions` | `ChangeApplied` | `incremental-change.e2e` | Patch mínimo validado |

## Regras

- Toda linha deve possuir um requisito ou caso de uso de origem.
- Links apontam para IDs estáveis, não apenas nomes de arquivos.
- Uma lacuna em qualquer coluna bloqueia o status “pronto”.
- Mudanças no contrato atualizam a matriz e os testes relacionados.

## Critérios de aceitação

- [ ] É possível navegar do requisito até o teste.
- [ ] Requisitos sem implementação aparecem como pendentes.
- [ ] Um teste falho aponta para o requisito afetado.
- [ ] A matriz é revisada em cada release.
