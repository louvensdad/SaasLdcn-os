# Pre Generation Gate

## Regra de bloqueio

A Meta-Fabrica nao deve aceitar projeto vindo de Project Room se:

- nao houver PromptMaster aprovado;
- nao houver Blueprint arquitetural;
- o Blueprint estiver em `BLUEPRINT_READY` ou `ENGINEERING_REVIEW` sem aprovacao final.

## Comportamento esperado

- Sem PromptMaster: voltar para Project Rooms.
- Sem Blueprint: abrir Architect Engine.
- Sem Engineering Review aprovado: abrir Engineering Review Center.
- Com Review aprovado: carregar spec e Blueprint na Meta-Fabrica.

## Beneficio

O usuario entende o que sera construido antes da geracao e a plataforma evita o fluxo de "clicar em proximo" sem revisao tecnica.
