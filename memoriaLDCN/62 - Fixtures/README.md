# Fixtures do vertical slice

## Organização de demonstração

- `org_demo` — Organização MLTagente Demo
- `usr_demo` — Usuário proprietário
- `ws_demo` — Workspace MVP
- `project_demo` — Lista de tarefas

## Sequência

1. Importar usuário, organização e workspace.
2. Criar projeto e conversa.
3. Carregar `Prompt.complete.json`.
4. Carregar `Blueprint.web-saas.json`.
5. Criar plano, build, logs e preview fictício.
6. Executar alteração incremental de prioridade.

## Regras

Fixtures são determinísticas, não contêm secrets, podem ser recriadas e não dependem de provedores externos.
