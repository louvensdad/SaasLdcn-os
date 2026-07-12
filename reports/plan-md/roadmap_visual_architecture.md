# Roadmap Visual Architecture

## Estrutura visual

A nova pagina usa uma arquitetura de painel executivo:

- Hero compacto e estrategico.
- Timeline de releases.
- Timeline operacional da plataforma.
- Health e cobertura em gauges.
- Accordions controlados para reduzir ruido visual.
- Mapas de dependencia e impacto.
- Roadmap visual em colunas.
- Painel de detalhe navegavel.

## UX

A lista plana de cards foi removida. Os modulos ficam agrupados por decisao executiva e so aparecem quando o usuario abre o grupo.

## Responsividade

A spec `roadmap-center.spec.ts` valida desktop e mobile, incluindo busca, abertura de accordion e leitura do roadmap visual.
