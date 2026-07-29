# Especificação ponta a ponta do MVP

## Entradas

Mensagem do usuário, respostas de descoberta e confirmação do Prompt.md.

## Artefatos

Prompt.md aprovado, Blueprint aprovado, plano, tarefas, versão, build, logs, preview e change request.

## Autoridade

Usuário aprova intenção e alterações; engines produzem artefatos; Orchestrator coordena; Runtime executa; Quality Platform valida.

## Eventos mínimos

ProjectCreated, PromptApproved, BlueprintApproved, BuildStarted, BuildFinished, PreviewStarted, ChangeRequested, PatchValidated e VersionApproved.

## Falhas

Toda falha usa [[Contratos de erro]], possui retry quando seguro e encaminha causa para Auto-Fix ou revisão.

## Definition of Done

- [ ] Projeto executa no preview.
- [ ] Código, Prompt.md, Blueprint e logs estão vinculados.
- [ ] Alteração incremental foi testada.
- [ ] Nenhuma credencial foi exposta.
- [ ] Estado final e custo da execução foram registrados.
