# Sistema de Capacidades

## Objetivo

Selecionar agentes, plugins, modelos e ferramentas pelo que conseguem fazer, não apenas pelo nome ou categoria.

## Estrutura

Capability possui nome, versão, executor, pré-condições, entradas, saídas, custo, risco, permissões, compatibilidade e evidências de qualidade.

## Exemplo

Agente Backend: criar API, refatorar, gerar testes, otimizar consultas, migrar banco e gerar documentação.

## Fluxo

Pedido → capacidades necessárias → candidatos compatíveis → política e risco → seleção → execução → avaliação → atualização da reputação.

## Dependências

Agent Contract, Plugin Contract, LLM Contract, Engine de Decisão, marketplace e governança.

## Aceitação

- [ ] Capacidades são declaradas e versionadas.
- [ ] Seleção considera pré-condições e permissões.
- [ ] Falhas e qualidade atualizam evidências, não apenas ranking.
- [ ] Usuário pode restringir capacidades por workspace.
