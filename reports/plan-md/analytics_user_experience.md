# Analytics user experience

## Fluxo

1. O usuário abre `/analytics` pela sidebar, busca global ou URL.
2. O breadcrumb mantém o retorno ao Platform Map.
3. Filtros globais atualizam a consulta no servidor.
4. Métricas do overview abrem drill-down.
5. Domínios analíticos ficam colapsáveis para reduzir carga cognitiva.
6. A exportação usa somente os dados reais do recorte atual.

## Estados

- Loading: skeletons estáveis.
- Sem contrato/dados: estado vazio com próximos passos.
- Erro: diagnóstico sem métricas residuais.
- Dados: overview, séries e tabelas retornados pelo backend.

## Responsividade e acessibilidade

Controles possuem labels acessíveis, foco visível e drawer com semântica de diálogo. Grids reduzem para uma coluna em telas estreitas e tabelas preservam rolagem horizontal interna.

