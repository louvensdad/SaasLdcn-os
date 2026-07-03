# Roadmap Release Management

## Implementacao

O backend agora retorna `releases` com:

- id
- titulo
- data
- status
- progresso
- funcionalidades
- dependencias
- riscos

A UI exibe uma timeline horizontal e um painel de release selecionada.

## Releases governadas

- v1 Foundation
- v2 Generation workflow
- v2.5 Engineering control plane
- v3 Observability and analytics
- v4 Agent runtime governance

## Regra de exibicao

Progresso, riscos e dependencias sao lidos do backend. A UI nao calcula releases ficticias quando o backend envia releases. O fallback so existe para compatibilidade com fixtures antigas.
