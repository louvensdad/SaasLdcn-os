# Engineering Review Center

## Objetivo

O Engineering Review Center foi adicionado como etapa obrigatoria entre o Architect Engine e a Meta-Fabrica.

Fluxo oficial:

PromptMaster -> Blueprint -> Engineering Review -> Approved -> Meta-Fabrica.

## Entrega

- Nova rota frontend: `/engineering-review`.
- Novo status oficial: `ENGINEERING_REVIEW`.
- Painel executivo com projeto, stack, arquitetura, status, complexidade, tempo, custo, confianca e prontidao.
- Mapa visual clicavel da arquitetura.
- Paineis colapsaveis de arquitetura, seguranca, banco, performance, cloud, UX, IA e DevOps.
- Custos, riscos e oportunidades marcados como estimativas quando nao vierem de dados reais.
- Aprovacao explicita antes de liberar a Meta-Fabrica.

## Modo IA

Quando ha provider ativo e o Blueprint nao esta degradado, a tela mostra modo LLM identificado. Quando nao ha chave ou a origem e degradada, mostra previa deterministica.
