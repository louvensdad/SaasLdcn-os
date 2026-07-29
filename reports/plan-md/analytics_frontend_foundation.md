# Analytics frontend foundation

## Entrega

- Rota oficial: `/analytics`.
- Navegação: sidebar, topbar, breadcrumb e busca global.
- Client autenticado preparado para `GET /api/analytics/overview`.
- Filtros enviados como query string para processamento server-side.
- Executive Overview, domínios colapsáveis, tabelas, séries, radar, breakdown de providers, exportação CSV e drawer de drill-down.
- Loading skeleton, erro explícito e estado vazio orientado a ação.
- Tabelas limitadas a 100 linhas por render e linhas com `content-visibility: auto`.

O Platform Map não recebeu node nesta entrega porque não existe router operacional de Analytics no backend. Isso segue a regra do próprio mapa: somente módulos reais e alcançáveis.

## Direção visual

“Ledger operacional”: superfícies densas, tipografia monoespaçada para dados, bordas de baixa luminosidade e telemetria/frescor visível. A interface evita gráficos decorativos e só monta visualizações quando o endpoint retorna séries reais.

