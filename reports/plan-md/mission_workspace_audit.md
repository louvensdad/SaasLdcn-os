# Mission Workspace — auditoria da implementação

Data: 2026-07-22  
Escopo: `/wizard`, Mission Workspace frontend/backend, contratos, persistência, BYOK e compatibilidade com o wizard legado.

## Resumo executivo

O worktree contém duas implementações concorrentes:

1. A rota atual usa `packages/contracts/mission.contract.ts` e uma experiência conversacional (`messages`, `steps`, `gaps`) ligada a `apps/web/lib/api/missions.ts`.
2. O novo módulo não versionado em `apps/web/modules/mission-workspace` usa jornadas por campos, autosave, decisões, riscos e endpoints `PATCH /missions`, `/decisions`, `/ai-action` e `/artifacts`.

O backend novo já persiste instâncias e expõe os endpoints da segunda implementação. A UI atual chama endpoints antigos (`/message`, `/advance-step`, `/artifact`) que não existem nas novas rotas. O módulo novo também importa `../registry`, mas ainda não possui `registry/index.ts`, e só quatro dos oito genomes existem.

Decisão: manter `/wizard` (opção A), tornar `apps/web/modules/mission-workspace` a implementação canônica, reduzir a página da rota a um shell com módulos lazy e preservar o wizard legado por um adaptador/migrador para `software.build`.

## Inventário e decisão por arquivo

### Rotas e UI atuais

| Arquivo | Função | Preservar | Motivo |
|---|---|---:|---|
| `apps/web/app/(app)/wizard/page.tsx` | Seletor/listagem atual de missões | Parcialmente | Preservar listagem e exclusão; substituir categorias/contrato antigo, incluir busca livre e carregar seletor do módulo. |
| `apps/web/app/(app)/wizard/new/page.tsx` | Criação intermediária de missão | Parcialmente | Preservar deep link `?type=` e navegação; usar store/contrato canônico e modos de execução. |
| `apps/web/app/(app)/wizard/[missionId]/page.tsx` | Workspace conversacional em três colunas | Parcialmente | Preservar rota, redirect seguro e layout; substituir chat/endpoints inexistentes pelo shell por campos, autosave e sugestões explícitas. |
| `apps/web/components/wizard/mission-genome-card.tsx` | Card de missão | Parcialmente | Reusar composição visual, adicionando ícone Lucide, tempo e complexidade. |
| `apps/web/components/wizard/mission-step-rail.tsx` | Rail simples de etapas | Parcialmente | Evoluir para estados reais da jornada, progresso, alertas, navegação e modo recolhido. |
| `apps/web/components/wizard/mission-gap-list.tsx` | Lista de gaps do contrato antigo | Parcialmente | Adaptar para `Gap`, motivos e ações persistidas. |
| `apps/web/components/wizard/mission-artifact-preview.tsx` | Preview/cópia/exportação Markdown | Sim | Capacidade útil; generalizar MIME/extensão por formato. |
| `apps/web/hooks/use-mission.ts` | Fetch isolado de uma missão | Não como fonte de estado | O Zustand canônico já cobre load/update/autosave; evitar dois estados concorrentes. |
| `apps/web/lib/api/missions.ts` | Client do contrato conversacional antigo | Não | Endpoints divergentes do backend novo; consolidar em `modules/mission-workspace/api/client.ts`. |

### Novo módulo parcial

| Arquivo | Função | Preservar | Motivo |
|---|---|---:|---|
| `modules/mission-workspace/types/index.ts` | Contratos ricos de genome/instância | Parcialmente | Boa base estrita; faltam inputs completos, rejeições, histórico, alertas, validações, modos autonomous/learning e contratos de sugestão completos. |
| `modules/mission-workspace/engine/MissionEngine.ts` | Jornada, validação, gaps, riscos e inconsistências | Parcialmente | Preservar funções puras; corrigir navegação, dependências cross-step, validação e impacto de mudanças. |
| `modules/mission-workspace/engine/ContextEngine.ts` | Decisões, impacto, interpolação e persistência | Parcialmente | Preservar marcador `[pendente]`; incluir rejeições/histórico e interpolação determinística sem busca ambígua. |
| `modules/mission-workspace/ai/AICouncil.ts` | Ações de IA por campo | Parcialmente | Preservar boundary; corrigir `field_id` (usa action id), validar BYOK antes da chamada e sempre gerar envelope atual/sugestão/motivo/impacto. |
| `modules/mission-workspace/api/client.ts` | Client compatível com endpoints novos | Sim, com ajustes | É o client canônico; adicionar rejeição, segurança BYOK e tipos compartilhados sem casts. |
| `modules/mission-workspace/stores/missionStore.ts` | Estado Zustand e autosave 2s | Parcialmente | Boa base; timer global causa interferência entre instâncias, rejeições não persistem, casts escondem divergência e alterações impactantes não pedem confirmação. |
| `registry/missions/software.build.ts` | Genome de software | Parcialmente | Preservar cobertura; remover emoji estrutural, corrigir encoding/dependências e mapear capacidades do legado. |
| `registry/missions/error.diagnose.ts` | Genome de diagnóstico | Sim, com ajustes | Fluxo específico e de alto valor; exigir stack/contexto antes do diagnóstico. |
| `registry/missions/project.analyze.ts` | Genome de análise | Parcialmente | Incluir input de arquivos/código, gaps, riscos e evidência. |
| `registry/missions/automation.create.ts` | Genome de automação | Parcialmente | Jornada distinta já valida o engine; ampliar regras, artefatos e aprovações humanas. |
| `registry/index.ts` | Registro central | Não existe | Bloqueio atual de import/typecheck; criar e registrar oito genomes. |
| `components/` e `hooks/` do módulo | UI/hook modular | Não existem | Criar conforme a arquitetura solicitada, com lazy load fora do shell inicial. |

### Wizard legado em `HEAD`

| Arquivo | Função | Preservar | Motivo |
|---|---|---:|---|
| `app/(app)/wizard/page.tsx` (3.788 linhas) | Intake e jornada software de 8 etapas | Parcialmente | Não restaurar o monólito; preservar requisitos, stack encadeada, arquitetura, capabilities, módulos, endpoints e revisão via genome/adaptadores. |
| `components/wizard/ai-intake-panel.tsx` | Intent → `ProjectSpec`, perguntas e stack sugerida | Parcialmente | Reaproveitar sem chave no browser e sem aplicação silenciosa; virar ações do campo/intenção. |
| `components/wizard/framework-specialist-panel.tsx` | Perfil/readiness do framework | Sim, lazy | Reusar como painel contextual de `software.build`. |
| `components/wizard/dependency-graph-panel.tsx` | Propagação, impacto, readiness e risco | Sim, lazy | Reusar em preview/impacto quando houver seleção de stack. |
| `components/wizard/infrastructure-recommendations-panel.tsx` | Recomendação/seleção de infraestrutura | Sim, lazy | Capacidade madura e alinhada ao step de infraestrutura. |
| `components/wizard/engineering-readiness-panel.tsx` | Equipe, prazo e maturidade | Sim, lazy | Reusar no blueprint de software. |
| `components/wizard/llm-tool-card.tsx` | Estado/pré-requisitos de ferramentas LLM | Parcialmente | Padrão de feedback útil; toda aplicação deve passar por confirmação explícita. |
| `components/wizard/spec-to-wizard.ts` | Conversão de `ProjectSpec` e match de registries | Sim | Base do migrador/adaptador do legado para `MissionContext`. |

### Backend e persistência

| Arquivo | Função | Preservar | Motivo |
|---|---|---:|---|
| `apps/api/app/routes/missions.py` | Endpoints autenticados | Parcialmente | Boa base e isolamento; `_resolve_api_key` ainda aceita resolução global e deve exigir chave do usuário para IA. |
| `apps/api/app/schemas/mission.py` | Contrato wire Pydantic | Parcialmente | Alinhar aos contratos TS completos, rejeições/history/inputs e versionamento otimista. |
| `apps/api/app/services/mission_service.py` | Orquestra persistência, IA e artefatos | Parcialmente | Preservar separação; adicionar rejeições, validação de versão e eventos de histórico. |
| `apps/api/app/repositories/mission_repository.py` | Persistência JSON por proprietário | Parcialmente | Preservar escopo por owner/redação; persistir contexto completo e tratar conflito de versão. |
| `apps/api/app/registry/missions_registry.py` | Validação/resumo de 8 tipos | Sim | Espelho fino adequado; frontend segue como fonte do genome. |
| `apps/api/app/engines/mission_field_action_engine.py` | Chamada LLM por campo | Parcialmente | Bom prompt anti-invenção; chamada deve ser impossível sem BYOK validada. |
| `apps/api/app/engines/mission_artifact_engine.py` | Compilador determinístico + resumo opcional | Parcialmente | Preservar compilação determinística; resumo LLM só com BYOK. |
| `apps/api/alembic/versions/20260722_f1_mission_instances.py` | Tabela/índices | Parcialmente | Estrutura funcional; adicionar FK de workspace quando compatível e colunas/contexto necessários sem quebrar SQLite. |
| `apps/api/tests/test_missions_registry.py` | Registry e diagnóstico | Sim | Expandir para genomes/contrato. |
| `apps/api/tests/test_missions_field_actions.py` | CRUD, autosave, IA, artefatos, isolamento | Sim | Atualizar regra: ação LLM sem BYOK deve ser bloqueada, não usar fallback global. |
| `apps/api/app/main.py` | Registra router protegido em `/api` | Sim | FastAPI com dependência autenticada já aplicado. |
| `apps/api/app/models/persistence.py` | Modelo SQLAlchemy de missão | Parcialmente | Manter alinhado à migração. |

### Contratos e consumidores externos

| Arquivo/módulo | Função | Preservar | Motivo |
|---|---|---:|---|
| `packages/contracts/mission.contract.ts` | Contrato conversacional antigo | Não como canônico | Diverge do backend novo; substituir/reexportar wire types alinhados. |
| `apps/web/lib/navigation.ts`, `search-items.ts`, `components/shell/app-shell.tsx` | Descoberta e metadados de `/wizard` | Sim | A rota permanece estável. |
| Dashboard, templates e empty states | Links para `/wizard` | Sim | Compatibilidade sem redirects adicionais. |
| Testes Playwright `wizard-flow-helpers.ts`, `localization.spec.ts`, `ldcn-presence.spec.ts` | Login/rota/localização | Parcialmente | Atualizar expectativas para seletor/workspace novo. |

## Dependências identificadas

- Roteamento: Next.js App Router (`app/(app)/wizard`, segmentos `new` e `[missionId]`).
- Estado global: Zustand; React Query para server state. O Mission Workspace deve usar Zustand para edição ativa e o client autenticado para persistência.
- Autenticação HTTP: bearer token obtido por `getAccessToken`, refresh único em 401, cookies com `credentials: include`.
- BYOK: `useActiveLlm` + `LlmConfirmationGate` no frontend; chave fica no vault do backend. O browser recebe apenas status/modelo. Missões não podem permitir modo LLM sem chave do usuário validada.
- APIs legadas preserváveis: registries de linguagem/runtime/framework/arquitetura/archetype, capabilities, módulos, endpoints, infraestrutura, dependency graph, readiness, riscos, Blueprint, PromptMaster e Gatekeeper.
- Outros consumidores do wizard: dashboard, templates, busca, sidebar/app shell, empty states e platform map.

## Padrões do projeto

- Arquivos/componentes em kebab-case; hooks `use-*.ts`; stores Zustand `use-*-store.ts`; módulos de domínio sob `modules/<feature>`.
- Componentes UI reutilizáveis em `components/ui`; tokens semânticos em `app/globals.css` (`--surface`, `--text`, `--muted`, `--accent`, estados, radius e tipografia `ds-*`).
- Lazy load: `next/dynamic` com skeleton (`CardLoading`) e imports diretos do módulo, como em Settings.
- Drawers: overlay acessível com focus trap, Escape, scrim e `prefers-reduced-motion`; para missão serão drawers locais, pois o drawer global só aceita três kinds fixos.
- Autosave: não havia autosave no wizard legado. O módulo parcial introduz debounce de 2s; deve ser por missão/instância e flush em navegação/unmount.
- IA: confirmação explícita via `LlmConfirmationGate`; chave nunca chega ao frontend. Sugestões precisam de modal atual/proposto/motivo/impacto.
- Design: workbench técnico denso, dark-first, paleta/tokens existentes, Lucide consistente, 4/8px rhythm, touch targets de 44px, feedback de loading e foco visível.

## Estratégia de migração

1. Manter `/wizard` como seletor e `/wizard/[missionId]` como workspace.
2. Criar `migrateLegacyWizardToMission` puro, mapeando os campos do formulário legado para answers do genome `software.build`.
3. Preservar as capacidades de registry/preview do legado como módulos lazy condicionais no blueprint, não como estado duplicado.
4. Unificar contratos e clients antes de conectar a UI.
5. Não apagar dados antigos. Quando houver payload legado local/servidor, convertê-lo na carga e salvar como nova versão de `MissionInstance`.

## Bloqueios e riscos encontrados

- `registry/index.ts` ausente; import do store quebrado.
- Quatro genomes MVP ausentes.
- Rota atual e backend usam contratos/endpoints incompatíveis.
- Dois clients de missão duplicados.
- `AICouncil` envia `action.id` como `field_id` e lê/escreve a chave errada no contexto.
- Rejeições são descartadas e não entram no autosave.
- Timer de autosave global pode salvar a missão errada ao alternar instâncias.
- Backend pode usar chave global quando `use_user_key=false`, violando a regra do Mission Workspace.
- `replace`/`append` são aplicados diretamente no store; a regra de entrega exige confirmação para toda alteração sugerida pela IA. Todos os modos serão envelopados por sugestão explícita.
- Arquivos novos não estavam incluídos no typecheck atual; casts `unknown as MissionInstance` escondem incompatibilidades.

## Checklist da Fase 1

- [x] Todos os arquivos do wizard atual e legado mapeados
- [x] Padrões do projeto documentados
- [x] Dependências e consumidores identificados
- [x] Estratégia de migração definida

