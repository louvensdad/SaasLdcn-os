# Máquina de Estados Global

## Estados

Idle → Receiving Request → Planning → Generating → Building → Executing → Preview → Testing → Waiting Approval → Deploying → Published → Archived.

## Regras

Cada transição possui evento, pré-condições, responsável, timeout, ação de compensação e estado de falha. Nenhum módulo pode alterar estado global sem comando ou evento autorizado.

## Aceitação

- [ ] Estados são finitos e versionados.
- [ ] Transições inválidas são rejeitadas.
- [ ] Estado pode ser reconstruído por eventos.
- [ ] Usuário vê estado e próximo passo.

## Correspondência com a implementação real (gap aberto, 2026-07-19)

Este modelo abstrato ainda não tem correspondência literal no código. O que existe hoje são dois enums concretos e mais granulares cobrindo fases distintas: `ProjectRoomStatus` (fase pré-geração: `DRAFT, UNDER_REVIEW, PROMPT_READY, PROMPT_APPROVED, BLUEPRINT_GENERATING, BLUEPRINT_READY, ENGINEERING_REVIEW, ENGINEERING_APPROVED, WAITING_META_FACTORY, META_FACTORY_RUNNING, GENERATING, VALIDATING, READY, FAILED, ARCHIVED`) e `GenerationJobStatus` (fase de build, ~28 estágios, ex. `QUEUED → PREPARING_CONTEXT → CONTRACTS_PLANNING → ... → BUILD_RUNNING → PACKAGE_CREATING → READY`). Nenhum estado do modelo abstrato acima (`Idle, Receiving Request, Planning, ...`) aparece literalmente nesses enums. Isso não foi resolvido nesta revisão — permanece como lacuna a decidir: manter este modelo como abstração conceitual de nível superior sobre os dois enums reais, ou aposentá-lo em favor de documentar os enums reais diretamente.


Estados comerciais e de elegibilidade: [[Planos, assinaturas e controle de acesso]].
