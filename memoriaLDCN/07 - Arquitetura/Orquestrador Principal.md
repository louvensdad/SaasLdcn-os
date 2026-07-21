# Orquestrador Principal

## Objetivo

Coordenar toda solicitação do usuário desde a interpretação até a entrega de software funcionando.

## Fluxo central

Usuário → Parser → Classificador → Memória → Planejamento → Orquestrador → Agentes → Validação → Execução → Preview → Deploy.

## Responsabilidades

- Interpretar intenção e contexto.
- Recuperar memórias relevantes.
- Criar plano e grafo de tarefas.
- Selecionar agentes e ferramentas autorizadas.
- Controlar dependências, paralelismo e bloqueios.
- Validar artefatos, testes e aprovações.
- Atualizar estado, logs e memória.

## Regras

Nenhum agente publica diretamente sem validação. Toda tarefa precisa de escopo, saída esperada, permissões e critério de sucesso.

Relacionados: [[Orquestração dos agentes]], [[Máquina de estados do projeto]], [[Máquina de estados da IA]], [[Arquitetura MCP]]
