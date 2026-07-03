# Analytics data contract audit

## Resultado da auditoria

O registro de geração contém descritores para `/analytics/overview`, `/analytics/revenue` e `/analytics/activity`. Esses itens descrevem endpoints que projetos gerados podem adotar; eles não são rotas operacionais do LDCN OS.

`apps/api/app/main.py` não registra router de Analytics e `apps/api/app/routes` não contém implementação correspondente.

## Contrato frontend preparado

`GET /api/analytics/overview` aceita:

- `period`
- `workspace`
- `project_type`
- `provider`
- `stack`
- `status`
- `module`
- `severity`
- `agent`
- `language`
- `framework`

Resposta esperada: `generated_at`, `metrics`, `filters` e `sections`. Cada seção pode fornecer `metrics`, `series`, `records` e `columns`.

## Endpoints ausentes

- `GET /api/analytics/overview`
- `GET /api/analytics/projects`
- `GET /api/analytics/llm`
- `GET /api/analytics/agents`
- `GET /api/analytics/quality`
- `GET /api/analytics/modernize`
- `GET /api/analytics/laboratory`
- `GET /api/analytics/documentation`
- `GET /api/analytics/security`
- `GET /api/analytics/business`
- `GET /api/analytics/technology-trends`

Billing e geografia também não possuem fonte analítica real. Métricas financeiras comerciais e heatmap geográfico ficam ocultos.

