# Roadmap Health Validation

## Health executivo

O endpoint `/api/roadmap` retorna `executive_health` e `coverage` como gauges com valor, status e base de calculo.

## Criterio

Os valores sao derivados do catalogo governado de roadmap:

- progresso medio por tags/categorias
- cobertura de APIs
- cobertura de contratos
- cobertura de documentacao
- progresso declarado por item quando o gauge representa um modulo especifico

## Anti-fake

A UI mostra a base (`basis`) de cada gauge. Isso evita interpretar os valores como uptime, APM ou cobertura de testes quando a fonte real e o roadmap governado.

## Testes

A spec cobre renderizacao de health, cobertura e laboratorio. O typecheck valida o contrato compartilhado atualizado.
