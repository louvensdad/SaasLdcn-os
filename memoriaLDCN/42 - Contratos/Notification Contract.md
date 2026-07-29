# Notification Contract

## Objetivo

Uniformizar alertas in-app, e-mail, webhook, push e notificações operacionais.

## Entrada e saída

Entrada: evento, destinatários, preferência e severidade. Saída: entrega, status, retry e preferência respeitada.

## Aceitação

- [ ] Usuário controla canais e frequência.
- [ ] Entregas são rastreáveis.
- [ ] Falhas não bloqueiam o domínio produtor.
