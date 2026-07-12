# Validação do Plano de Correção — Backend & Frontend

**Data:** 2026-06-30
**Branch:** feat/premium-foundation
**Documento validado:** Plano de Correção (referência: `reports/enterprise_audit_2026-06-30.md`)
**Método:** leitura das implementações reais no código. **Nenhum arquivo foi alterado.**

---

## Sumário de veredictos

| Etapa | Veredicto | Realidade no código |
|---|---|---|
| B1 PostgreSQL+Alembic | ✅ Correto | Sem `app/models/`; `sqlite3` cru + `CREATE TABLE`/`initialize()` em vários repos |
| B2 Redis rate limiter | ✅ Correto | `rate_limit.py` usa `self._hits: dict` em processo |
| B3 Redis key vault | ✅ Correto | `user_key_session_service.py` usa `self._vault: dict` em processo |
| **B4 Persistir jobs** | ❌ **Premissa errada** | Jobs **já** são 100% persistidos em SQLite |
| B5 Limite de gerações | ✅ Correto | Não há checagem de quota (mas o helper também não existe — ver abaixo) |
| B6 SameSite + CORS | ⚠️ Superestimado | Cookie já é `samesite="lax"` + path escopado; CORS já retorna `[]` |
| B7 Paginação | 🟡 Plausível | Não verificado endpoint a endpoint |
| B8 Versionamento `/v1/` | ✅ Correto | `api_prefix = "/api"` |
| B9 Índices de analytics | ✅ Confirmado | `audit_logs` só tem índice em `user_id`; faltam `created_at`/`event_code` |
| B10 SSE replay/cancel | ✅ Confirmado | Endpoint SSE sem `Last-Event-ID`/`is_disconnected` |
| F1 Planning Center | ✅ Confirmado | `app/(app)/planning/` não existe |
| **F2 Skeletons** | ❌ **Superestimado** | Apenas **1** página tem `fallback={null}`, não 8 |
| **F3 Three.js lazy** | ⚠️ **Quase pronto** | Componentes já usam `next/dynamic`; não há `index.ts` para editar |
| F4 Breadcrumb pipeline | ✅ Correto | Componente não existe |
| F5 Analytics empty CTA | ✅ Correto | `EmptyStatePremium` é genérico, sem CTA por seção |
| F6 Consistência empty state | 🟡 Plausível | `empty-states/empty-state.tsx` existe; adoção não verificada |
| **F7 Banner degraded** | ⚠️ **Quase pronto** | Banner já implementado em `meta-factory/page.tsx` |
| **F8 Base do client HTTP** | ⚠️ **Quase pronto** | Base URL já centralizada via `API_BASE_URL` |

Legenda: ✅ preciso · ⚠️ parcialmente já feito / superestimado · ❌ premissa incorreta · 🟡 plausível mas não confirmado

---

## Correções importantes

### B4 — construída sobre premissa falsa
O plano afirma: *"Restart do servidor destrói todos os jobs em execução e histórico de geração."* Isso **não é verdade**:

- `apps/api/app/repositories/generation_job_repository.py` já persiste jobs em SQLite.
- `apps/api/app/engines/generation_job_engine.py` chama `self._save()` a **cada** transição de estado — status, checkpoints, artefatos e a lista `events` (últimos 2000) sobrevivem a restart.
- O que **não** sobrevive é a **thread** de execução em memória (`self._threads`), mas já existe endpoint `resume()` para isso.
- O plano ainda aponta o **arquivo errado** (`modernize_job_repository.py` — esse é a pipeline Modernize, também já persistida).
- A única peça genuinamente faltante em B4 é o **rastreamento de tokens** (colunas `input_tokens_total`/`output_tokens_total`) — isso é novo e vale manter.

### B4/B5/B10 — referenciam métodos de engine que ainda não existem
`generation_job_engine.count_active_for_user()`, `.add_usage()` e `.stream(from_seq=...)` são assumidos pelo plano mas **não estão implementados** — são trabalho novo, não edições.

### F2 — superestimado em 8×
Apenas `apps/web/app/(app)/meta-factory/page.tsx:51` usa `fallback={null}`. As outras 7 páginas listadas ou não usam `Suspense` ou já passam fallback. `PageSkeleton` de fato não existe — então criar o componente, mas o rollout é **uma** página, não oito.

### F3 — em grande parte já feito
`ambient-backdrop`, `ldcn-core-badge`, `scene-canvas-inner` e `topology-graph` já importam via `next/dynamic`. O alvo de edição proposto pelo plano, `components/three/index.ts`, **não existe**. Lacuna restante: verificar se `ldcn-core.tsx` e `ambient-field.tsx` também são lazy.

### F7 — já existe
`meta-factory/page.tsx` tem estado `degraded` alimentado por `event.degraded` e renderiza um banner (`metaFactory.degradedMode`, ~linha 815). O único delta real do plano é granularidade por agente (`degradedAgents[]`) — um refinamento, não a feature ausente que descreve.

### B6 — menor do que descrito
O refresh cookie já tem `samesite="lax"` e `path="/api/auth"`. A mudança é só `lax`→`strict` (testar fluxos de refresh). O CORS já retorna `[]` em produção em vez de wildcard — o plano quer um `raise` (fail-fast), o que é melhoria legítima mas não é um buraco de segurança hoje.

### F8 — base URL já centralizada
Em `apps/web/lib/api/endpoints.ts` via `API_BASE_URL`. O trabalho restante é apenas a troca de string `/api/` → `/api/v1/`, coordenada com B8.

---

## Etapas confirmadas precisas (alto valor)
B1, B2, B3, B8, B9, B10, F1, F4, F5 conferem com o código.

**Observação sobre B1:** é o âncora P0 correto — mas a migração precisa absorver `initialize()`/`CREATE TABLE` de **vários** repos (`user_repository`, `generation_job_repository`, `modernize_job_repository`, entre outros), não só `user_repository.py`.

---

## Evidências (arquivos inspecionados)

- `apps/api/app/core/config.py` — `api_prefix="/api"`, `sqlite_path`, sem `database_url`/`redis_url`; CORS retorna `[]` em produção
- `apps/api/app/core/rate_limit.py` — `self._hits: dict` in-process
- `apps/api/app/services/user_key_session_service.py` — `self._vault: dict` in-process
- `apps/api/app/repositories/generation_job_repository.py` — SQLite persistido
- `apps/api/app/engines/generation_job_engine.py` — `_save()` a cada transição; sem `count_active_for_user`/`add_usage`/replay
- `apps/api/app/repositories/user_repository.py` — `CREATE TABLE` + `initialize()`; `audit_logs` só com índice `user_id`
- `apps/api/app/repositories/modernize_job_repository.py` — SQLite persistido
- `apps/api/app/routes/auth.py` — cookie já `samesite="lax"`, `path` escopado
- `apps/api/app/routes/meta_factory.py` — SSE sem `Last-Event-ID`/`is_disconnected`; sem quota
- `apps/web/app/(app)/` — sem `planning/`
- `apps/web/app/(app)/meta-factory/page.tsx` — único `fallback={null}`; banner `degraded` já presente
- `apps/web/components/three/` — sem `index.ts`; componentes já com `next/dynamic`
- `apps/web/components/feedback/` — sem `PageSkeleton`
- `apps/web/components/empty-states/empty-state.tsx` — existe
- `apps/web/components/analytics/*.tsx` — `EmptyStatePremium` genérico
- `apps/web/lib/api/endpoints.ts` — `API_BASE_URL` centralizado; paths com `/api/` hardcoded
