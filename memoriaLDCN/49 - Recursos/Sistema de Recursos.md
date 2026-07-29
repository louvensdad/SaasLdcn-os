# Sistema de Recursos

## Objetivo

Controlar CPU, RAM, disco, tokens, containers, portas, concorrência e quotas por organização, workspace, projeto e execução.

## Fluxo

Solicitação → estimativa → quota → reserva → execução → medição → liberação → cobrança e relatório.

## Dependências

Billing, runtime, scheduler, sandbox, observabilidade e workspace.

## Aceitação

- [ ] Recursos são reservados antes da execução.
- [ ] Limites impedem starvation entre projetos.
- [ ] Consumo real é reconciliado com reserva.
- [ ] Excesso produz ação previsível, não falha silenciosa.
