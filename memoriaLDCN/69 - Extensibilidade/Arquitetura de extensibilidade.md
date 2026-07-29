# Arquitetura de extensibilidade

## Objetivo

Definir onde plugins, extensões e integrações podem interceptar o ciclo da plataforma.

## Pontos de extensão

Chat: interpretar intenção e sugerir capacidades.

Blueprint: validar, enriquecer ou adicionar seções.

Planning: adicionar tarefas ou políticas.

Generation: fornecer templates, transformadores ou validadores.

Runtime: fornecer imagens, runners ou health checks.

Deploy: adicionar destinos e pós-deploy hooks.

## Regras

Plugins não alteram estado diretamente; usam contratos e comandos autorizados. Cada hook possui timeout, isolamento, versão e política de falha.

## Critérios de aceitação

- [ ] Plugin declara pontos de extensão e permissões.
- [ ] Falha de plugin pode ser isolada ou ignorada conforme política.
- [ ] Ordem de hooks é determinística.
- [ ] Intervenções aparecem na auditoria.
