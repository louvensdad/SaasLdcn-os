# Pipeline de engenharia reversa

## Objetivo

Transformar um projeto existente em representação compreensível e evolutiva dentro do MLTagente.

## Fluxo

Importar snapshot → indexar arquivos → detectar stack → analisar dependências → reconstruir arquitetura → gerar documentação → criar Blueprint → validar com usuário → habilitar agentes.

## Dependências

Importação, Git, sistema de arquivos, memória, Knowledge Base, Blueprint e segurança.

## Relacionamentos

Alimenta migração, refatoração, documentação viva, testes e deploy.

## Critérios de aceitação

- [ ] Projeto original permanece preservado.
- [ ] Cada conclusão aponta para evidência no código.
- [ ] Incertezas são apresentadas ao usuário.
- [ ] Blueprint gerado pode ser revisado antes da alteração.

## Prioridade

Alta

## Fase

Beta
