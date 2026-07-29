# Roadmap Center Refactor

## Resultado

A pagina de Planejamento foi substituida por um Roadmap Center executivo em `apps/web/app/(app)/roadmap/page.tsx`.

A nova experiencia entrega:

- Hero executivo com metricas vindas do endpoint `/api/roadmap`.
- Releases horizontais com progresso, dependencias, funcionalidades e riscos.
- Timeline clicavel da plataforma.
- Roadmap executivo em accordions controlados.
- Busca incremental e filtros por dominio.
- Cards de modulo compactos com icone, status, progresso, dependencias, release, atualizacao, owner, prioridade, maturidade e risco.
- Painel de detalhe para APIs, motores, skills, contratos, documentacao e impacto.
- Mapas de dependencias e impacto.
- Health executivo, cobertura, sprints, roadmap visual, prioridades, estatisticas e historico.

## Fonte dos dados

A UI consome apenas `useRoadmap()`, que chama o backend real via `apiClient.getRoadmap()`.

Os novos campos foram adicionados em:

- `apps/api/app/engines/roadmap_engine.py`
- `apps/api/app/schemas/roadmap.py`
- `packages/contracts/roadmap.contract.ts`

## Decisao de integridade

Os numeros exemplificados no briefing nao foram hardcoded. Quando uma metrica nao existe como telemetria externa, a engine deriva o valor dos itens governados ou registra explicitamente que nao ha contador autonomo.

## Validacao

Executado:

- `pytest apps\api\tests\test_skill_system_foundation.py apps\api\tests\test_secure_extensions.py`
- `npm run typecheck`
- `npx playwright test roadmap-center.spec.ts`
- `npx playwright test consolidation-governance.spec.ts --grep "roadmap page"`
