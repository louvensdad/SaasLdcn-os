# Fluxo oficial do MVP

## Escopo

Um projeto Web simples, com Chat de Criação, Prompt.md, Blueprint, planejamento, geração, build, preview e alteração incremental.

## Caminho feliz

Usuário descreve ideia → Chat de Criação → Prompt.md → aprovação → Blueprint → plano → agentes → geração → build → preview → alteração conversacional → novo build → preview atualizado.

## Fora do MVP

Marketplace comercial, Mobile, Kubernetes, Firecracker, SCIM, multi-região, billing avançado e marketplace de agentes.

## Critérios de aceitação

- [ ] Usuário não precisa de terminal local.
- [ ] Prompt.md e Blueprint são persistidos e versionados.
- [ ] Build retorna estado e erro padronizados.
- [ ] Preview abre a versão gerada.
- [ ] Alteração pequena produz patch mínimo.
- [ ] Novo build e preview mantêm rastreabilidade.
- [ ] Usuário consegue rollback.

## Dependências

[[Prompt.md Schema]], [[Blueprint Schema]], [[Protocolo de alteração incremental]], [[Contrato de execução]], [[Matriz de permissões por ação]], [[Fluxo oficial do MVP]]


O MVP inclui validação manual do Plano Estudante; automação e provedor externo permanecem extensões futuras.
