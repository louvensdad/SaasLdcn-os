# Mobile Factory — fechamento das fases 0–5

Data: 2026-07-02

## Conclusão

As fases 0–4 do roadmap canônico estão implementadas e validadas. A fase 5 continua corretamente separada: Flutter não é anunciado como geração disponível e qualquer job que tente usar esse stack é bloqueado com erro explícito antes da execução. Publicação em app stores e o companion app do LDCN OS permanecem fora do escopo.

## Matriz final

| Fase | Estado | Evidência |
| --- | --- | --- |
| 0 — Delivery type | Concluída | Schema, contrato, persistência, migration Alembic, propagação para `ProjectSpec` e smoke test de upgrade/downgrade |
| 1 — Walking skeleton | Concluída | Estados mobile, pipeline job e streaming condicionais, prompt, territory, context pack, validação estrutural, build e E2E até ZIP |
| 2 — Architect | Concluída | Área mobile condicional, metadata explícita, readiness dinâmico, segurança mobile e nó no modelo arquitetural |
| 3 — UI | Concluída | Seletor com quatro delivery types, pipeline com estágio mobile condicional e grid derivado da quantidade de fases |
| 4 — Chunks e reparo | Concluída | Oito chunks mobile, retry/resume por chunk, Quality Gate Expo completo, Auto-Repair e exclusões de artefatos do pacote |
| 5 — Flutter | Planejada, fora do escopo | Escolha Flutter é rejeitada antes da criação do job até existir toolchain, prompt, gate, build e reparos próprios |

## Correções estruturais adicionais

- O build final agora valida todos os manifestos encontrados no monorepo, em vez de aprovar após o primeiro backend/web/mobile.
- `MOBILE_VALIDATING` exige `app.json`, `package.json`, `tsconfig.json`, `App.tsx`, `.env.example` e cliente de API.
- Checkpoints persistem o chunk; retry e resume retomam o chunk que falhou.
- O diagnóstico de build não acessa mais o campo inexistente `GenerationValidationReport.errors`.
- `node_modules`, `ios` e `android` são excluídos da listagem/exportação/ZIP.

## Validação executada

- Backend direcionado: **135 passed**, 2 avisos de depreciação externos.
- E2E real mobile: job chegou a `READY`, executou build npm, preparou o pacote e o ZIP continha `apps/mobile/` sem `node_modules`.
- Frontend: `npm run typecheck` aprovado.
- Frontend: `npm run build` aprovado; avisos ESLint preexistentes permanecem sem novos erros.
- Playwright fase 3: **8 passed** cobrindo os quatro delivery types, presença/ausência do estágio mobile e grid de dez fases.

## Limites preservados

Não foram implementados Fastlane, App Store Connect, Google Play Console, code signing, EAS Build, publicação em lojas ou companion app do LDCN OS.
