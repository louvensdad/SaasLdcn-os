# Plano de Correção (Revisado) — Backend & Frontend

**Data:** 2026-06-30
**Branch base:** feat/premium-foundation
**Substitui:** o Plano de Correção original, após validação contra o código real
**Referências:** `reports/enterprise_audit_2026-06-30.md`, `reports/plan_validation_2026-06-30.md`

## O que mudou nesta revisão

Após ler as implementações reais, cinco etapas foram re-escopadas e três premissas corrigidas. As mudanças estão marcadas com **[REVISADO]** e resumidas aqui:

- **B4** deixou de ser "persistir jobs" (já persistidos) e passou a ser **apenas rastreamento de tokens + auto-resume opcional**. Estimativa 2d → **0.5d**.
- **B5/B10** exigem métodos de engine novos (`count_active_for_user`, `add_usage`, `stream(from_seq)`) — explicitados como pré-requisitos.
- **F2** afeta **1 página**, não 8. Estimativa 1d → **2h**.
- **F3** já está quase pronto (componentes já usam `next/dynamic`; não há `index.ts`). Estimativa 4h → **1h de verificação**.
- **F7** já existe (banner `degraded`). Vira **refinamento opcional** (granularidade por agente). Estimativa 2h → **1h** (ou descartar).
- **F8** base URL já centralizada. Vira **troca de string** coordenada com B8. Estimativa 2h → **30min**.
- **B6** cookie já `samesite="lax"` + path escopado; CORS já retorna `[]`. Vira **hardening incremental**.

Total re-escopado: ~2.5 dias a menos de trabalho do que o plano original estimava.

---

# BACKEND

## Etapa B1 — PostgreSQL + Alembic
**Risco:** 🔴 | **Estimativa:** 3 dias | **Prioridade:** P0 | **Status:** ✅ confirmado válido

Sem mudanças de escopo. **Atenção adicional [REVISADO]:** a migração precisa absorver `initialize()`/`CREATE TABLE IF NOT EXISTS` de **vários** repositórios, não só `user_repository.py`:

- `apps/api/app/repositories/user_repository.py` (`users`, `refresh_tokens`, `audit_logs`)
- `apps/api/app/repositories/generation_job_repository.py` (`generation_jobs`)
- `apps/api/app/repositories/modernize_job_repository.py` (`modernize_jobs`)
- demais repos com `initialize()` (verificar `project_repository`, `project_room_repository`, `catalog_repository`, `download_repository`, `git_provider_repository`, `registry_repository`)

Cada `initialize()` chamado no `lifespan` de `main.py` deve sair **em conjunto** — remover só um quebra o boot se os outros ainda esperarem a tabela. Faça o inventário antes de iniciar.

Índices faltantes a incluir no schema inicial (confirmados):
- `refresh_tokens.expires_at`
- `audit_logs.event_code`
- `audit_logs.created_at`

**Aceite:** `pytest` verde com `LDCN_DATABASE_URL=postgresql://...` **e** `sqlite:///...`; `alembic upgrade head` sem erro; nenhum `CREATE TABLE` remanescente em runtime.

## Etapa B2 — Redis: Rate Limiter distribuído
**Risco:** 🟡 | **Estimativa:** 1 dia | **Prioridade:** P0 | **Status:** ✅ confirmado válido

Sem mudanças. `rate_limit.py` usa `self._hits: dict` in-process — inútil com 2 instâncias. O plugin backend (InMemory fallback + RedisBackend sliding-window) do plano original está correto. Preservar os 3 buckets existentes (`auth`/`generation`/`default`) e a identidade por usuário já implementada.

**Aceite:** limiter funciona com 2 uvicorn; Redis opcional em dev.

## Etapa B3 — Redis: User Key Vault distribuído
**Risco:** 🟡 | **Estimativa:** 1 dia | **Prioridade:** P0 | **Status:** ✅ confirmado válido

Sem mudanças. `user_key_session_service.py` usa `self._vault: dict` in-process. Migrar para Redis com TTL, mantendo: Fernet em repouso (`encrypt_secret`), máscara de exibição, `resolve_for_model_choice` e o import de `app.data.model_registry` (caminho confirmado correto).

**Aceite:** chave persiste quando a request cai em outra instância.

## Etapa B4 — Rastreamento de tokens + auto-resume [REVISADO]
**Risco:** 🟢 | **Estimativa:** ~~2 dias~~ → **0.5 dia** | **Prioridade:** ~~P0~~ → **P2**

**Premissa original estava errada.** Jobs de geração **já são** 100% persistidos em SQLite:
- `generation_job_repository.py` grava em SQLite.
- `generation_job_engine.py` chama `self._save()` a cada transição — status, checkpoints, artefatos e `events` (últimos 2000) sobrevivem a restart.
- Já existe endpoint `resume()`.

O que **realmente** falta (escopo revisado):

1. **Token tracking** — adicionar contadores de uso. Como o job é um blob JSON, pode ser feito **sem migração de coluna**: acumular `inputTokensTotal`/`outputTokensTotal` no dicionário do job e salvar via `_save()`. Ponto de captura: em `generation_job_engine._run_llm_step`, após `response, parsed = self._route_with_timeout(...)`, ler `response.usage` (os adapters em `app/engines/llm/*` já expõem usage) e somar no job.
   > Se preferir colunas dedicadas para query/agregação, aí sim é migração Alembic (depende de B1). Decidir por caso de uso de analytics.

2. **Auto-resume no boot (opcional)** — no `lifespan`, varrer jobs com `status` running/queued e reagendar via `resume()`. Só necessário se "retomar sozinho após restart" for requisito; hoje o usuário retoma manualmente.

**Não fazer:** não reescrever `modernize_job_repository.py` (arquivo errado no plano original; também já persistido).

**Aceite:** job visível após restart (**já passa hoje**); tokens acumulados aparecem no job após uma geração.

## Etapa B5 — Limite de gerações simultâneas por usuário
**Risco:** 🟢 | **Estimativa:** 4h → **6h** [REVISADO] | **Prioridade:** P1

Válido, mas **pré-requisito não mencionado no plano original:** `generation_job_engine.count_active_for_user(user_id)` **não existe** — precisa ser criado (contar jobs do usuário em status ativo: `QUEUED`/`*_GENERATING`/`*_PLANNING`/`*_VALIDATING`/`RUNNING`, excluindo `READY`/`FAILED`/`PAUSED`/`STALLED`/`NEEDS_USER_ACTION`). Adicionar método no repo (`SELECT ... WHERE owner_user_id=? AND status IN (...)`) e expor na engine.

Depois, o guard `_check_generation_quota` nos endpoints de geração de `routes/meta_factory.py`, e `max_concurrent_generations_per_user` em `config.py` — como no plano original.

**Aceite:** 3ª geração simultânea recebe 429 com mensagem clara.

## Etapa B6 — Hardening de cookie + CORS fail-fast [REVISADO]
**Risco:** 🟢 | **Estimativa:** 2h → **1h** | **Prioridade:** P2

**Estado atual já é bom** — re-escopo para hardening incremental:
- Cookie em `routes/auth.py` **já** é `httponly`, `secure` (em prod), `samesite="lax"`, `path=f"{api_prefix}/auth"`. Mudança real: avaliar `lax`→`strict` (testar refresh após navegação cross-site; `lax` já cobre CSRF de POST). **Baixa urgência.**
- CORS em `config.py` **já** retorna `[]` em produção sem `LDCN_ALLOWED_ORIGINS` (não é wildcard). Mudança: trocar o retorno silencioso por `raise RuntimeError(...)` para falha explícita no boot. **Melhoria de operabilidade, não de segurança.**

**Aceite:** startup em produção sem `LDCN_ALLOWED_ORIGINS` → erro claro; refresh continua funcionando se adotar `strict`.

## Etapa B7 — Paginação nos endpoints de listagem
**Risco:** 🟢 | **Estimativa:** 1 dia | **Prioridade:** P1 | **Status:** 🟡 validar antes

`PaginatedResponse[T]` genérico + aplicar em `projects`, `project-rooms`, `templates`, `skills`, seções de `analytics`. **Antes de implementar**, confirmar quais desses endpoints hoje retornam lista crua (não verificado na validação) para não paginar o que já é pequeno/fixo (ex.: `skills`/`templates` podem ser catálogos estáticos).

**Aceite:** `GET /api/v1/projects?limit=5&offset=0` → `has_more: true` com >5 projetos.

## Etapa B8 — Versionamento de API (`/v1/`)
**Risco:** 🟡 (breaking) | **Estimativa:** 1 dia | **Prioridade:** P1 | **Status:** ✅ confirmado válido

`api_prefix = "/api/v1"` + redirect 308 de compatibilidade `/api/*` → `/api/v1/*`. Sem mudanças. **Coordenar com F8** (troca da string no client).

**Aceite:** `/api/health` → 308 para `/api/v1/health`.

## Etapa B9 — Analytics: índices e cache
**Risco:** 🟢 | **Estimativa:** 4h | **Prioridade:** P2 | **Status:** ✅ confirmado válido

Índices de `audit_logs` (`created_at`, `event_code`) e `refresh_tokens` (`expires_at`) — **confirmado faltando** (hoje só há índice em `audit_logs.user_id` e `refresh_tokens.user_id`). Se B1 já os criar no schema inicial, esta etapa vira só o **cache de 60s** em `analytics_service.py`. Não duplicar os índices entre B1 e B9.

**Aceite:** `EXPLAIN QUERY PLAN` usa índice em `WHERE created_at > ?`.

## Etapa B10 — SSE: backpressure e reconexão com Last-Event-ID
**Risco:** 🟡 | **Estimativa:** 2 dias | **Prioridade:** P1 | **Status:** ✅ válido, com pré-requisito

O endpoint SSE (`routes/meta_factory.py`, `stream_generation_job`, ~linha 189) **não** trata `Last-Event-ID` nem `is_disconnected` — correto. **Pré-requisito [REVISADO]:** a engine precisa de `stream(job_id, from_seq=...)` que faça replay dos `events` persistidos (a lista já existe no job, últimos 2000 — a base de dados para replay **já está lá**, falta o método de leitura por sequência). Adicionar índice de sequência (`event_seq`) por evento ao emitir, para o `from_seq` ser determinístico.

**Aceite:** fechar aba durante geração cancela o LLM call (verificar logs).

---

# FRONTEND

## Etapa F1 — Planning Center
**Risco:** 🟢 | **Estimativa:** 3 dias | **Prioridade:** P1 | **Status:** ✅ confirmado válido

`app/(app)/planning/` não existe. Construir como view derivada de `project_rooms` (sem novo endpoint), como no plano original. Único módulo da sidebar sem página — prioridade de demo mantida.

**Aceite:** aparece na sidebar; boards agrupados por status.

## Etapa F2 — Skeleton onde falta [REVISADO]
**Risco:** 🟢 | **Estimativa:** ~~1 dia~~ → **2h** | **Prioridade:** P2

**Escopo real: 1 página, não 8.** Só `meta-factory/page.tsx:51` usa `fallback={null}`. As demais páginas listadas no plano original ou não usam `Suspense` ou já passam fallback.

1. Criar `apps/web/components/feedback/page-skeleton.tsx` (não existe — confirmado).
2. Trocar `fallback={null}` → `<PageSkeleton rows={6} />` em `meta-factory/page.tsx:51`.
3. **Auditar** o resto: `grep -rn "Suspense" apps/web/app --include=*.tsx` e corrigir só o que realmente renderiza `null`/vazio.

**Aceite:** nenhuma página com `fallback={null}`; skeleton aparece em rede lenta.

## Etapa F3 — Lazy load do Three.js [REVISADO]
**Risco:** 🟢 | **Estimativa:** ~~4h~~ → **1h (verificação)** | **Prioridade:** P3

**Já em grande parte feito.** `ambient-backdrop`, `ldcn-core-badge`, `scene-canvas-inner` e `topology-graph` já importam via `next/dynamic`. O alvo `components/three/index.ts` do plano original **não existe** — não criar barrel novo.

Trabalho restante:
1. Verificar se `ldcn-core.tsx` e `ambient-field.tsx` também são carregados via `dynamic` (ou só através dos wrappers já-lazy).
2. Conferir `next.config.js` para `optimizePackageImports: ['three', '@react-three/fiber', '@react-three/drei']`.
3. Rodar Lighthouse para confirmar que `three` não está no critical chunk.

**Aceite:** FCP < 2s; bundle `three` fora do critical chunk.

## Etapa F4 — Breadcrumb de pipeline
**Risco:** 🟢 | **Estimativa:** 1 dia | **Prioridade:** P2 | **Status:** ✅ confirmado válido

Sem mudanças. Criar `components/project/pipeline-breadcrumb.tsx` e inserir no topo das páginas do pipeline com `currentStage`.

**Aceite:** breadcrumb correto em Architect, Engineering Review, Meta Factory.

## Etapa F5 — Analytics: seções "empty" com CTA
**Risco:** 🟢 | **Estimativa:** 4h | **Prioridade:** P1 | **Status:** ✅ confirmado válido

`EmptyStatePremium` (em `components/analytics/`) é genérico, sem CTA por seção — correto. Adicionar tratamento por `section.id` (documentation → Documentation Center; laboratory → Engineering Lab) como no plano original.

**Aceite:** seções empty têm CTA para o módulo correspondente.

## Etapa F6 — Consistência de empty states globais
**Risco:** 🟢 | **Estimativa:** 4h | **Prioridade:** P3 | **Status:** 🟡 componente existe, adoção a validar

`components/empty-states/empty-state.tsx` **existe**. Auditar `projects`, `templates`, `skills`, `project-rooms`, `documentation` e padronizar o uso. Trabalho é adoção, não criação.

**Aceite:** listas vazias usam o mesmo `EmptyState`.

## Etapa F7 — Banner degraded por agente (opcional) [REVISADO]
**Risco:** 🟢 | **Estimativa:** 2h → **1h ou descartar** | **Prioridade:** P3

**Já existe.** `meta-factory/page.tsx` tem estado `degraded` alimentado por `event.degraded` (linhas ~284/293/300/333) e renderiza banner via `metaFactory.degradedMode` (~linha 815). O feature central do plano original **já está entregue**.

Delta opcional: trocar o booleano `degraded` por lista `degradedAgents[]` para nomear quais agentes caíram no MockAdapter. Só fazer se o texto "quais agentes" for requisito de produto; caso contrário, **descartar a etapa**.

**Aceite:** banner amarelo já aparece sem API key (verificado). Se implementar o delta: banner lista os agentes degradados.

## Etapa F8 — Cliente HTTP versionado [REVISADO]
**Risco:** 🟡 (coordenar com B8) | **Estimativa:** 2h → **30min** | **Prioridade:** P1

**Base URL já centralizada** em `lib/api/endpoints.ts` via `API_BASE_URL` (`process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001'`). Não há dispersão de base URL para consolidar.

Trabalho real: quando B8 mudar o backend para `/api/v1/`, trocar `/api/` → `/api/v1/` em `endpoints.ts` e nos `fetch` que ainda concatenam `${API_BASE_URL}/api/...` (ex.: `meta-factory.ts`, `modernize.ts`, `user-keys.ts`, `llm-settings.ts`, `api-collection.ts`, `generated-export.ts`, `project-rooms.ts`). Idealmente introduzir `API_V1 = ${API_BASE_URL}/api/v1` e referenciar.

**Aceite:** todas as chamadas usam `/api/v1`; nenhum `/api/` legado hardcoded.

---

# SEQUÊNCIA DE ENTREGA REVISADA

O caminho crítico continua sendo B1 (habilita índices/migrations). As etapas re-escopadas (B4, F2, F3, F7, F8) ficaram muito mais baratas e podem ser encaixadas como preenchimento.

```
Semana 1
├── B1 PostgreSQL + Alembic              (3 dias)  ← inclui todos os initialize()
└── B6 Hardening cookie/CORS             (1h)      [REVISADO: menor]

Semana 2
├── B2 Redis Rate Limiter                (1 dia)
├── B3 Redis User Vault                  (1 dia)
├── B5 Limite gerações (+count_active)   (6h)      [REVISADO: +método engine]
└── B9 Cache analytics (índices via B1)  (2h)      [REVISADO: índices já em B1]

Semana 3
├── F1 Planning Center                   (3 dias)
├── B4 Token tracking + auto-resume      (0.5 dia) [REVISADO: era 2d]
├── F5 Analytics empty CTA               (4h)
└── F2 Skeleton (1 página)               (2h)      [REVISADO: era 1d]

Semana 4
├── B10 SSE replay/cancel (+stream())    (2 dias)
├── B7 Paginação (validar antes)         (1 dia)
├── B8 Versionamento /v1/                (1 dia)
├── F8 Client /v1/ (troca de string)     (30min)   [REVISADO: coordenar B8]
├── F4 Breadcrumb pipeline               (1 dia)
├── F3 Three.js (verificação)            (1h)      [REVISADO: já lazy]
├── F6 Empty states (adoção)             (4h)
└── F7 Degraded por agente (opcional)    (1h/skip) [REVISADO: já existe]
```

O plano original previa 7 semanas; com o re-escopo, o trabalho real cabe confortavelmente em ~4 semanas mantendo a mesma ordem de dependências.

---

# PRÉ-REQUISITOS NOVOS (não estavam no plano original)

Métodos/atributos que o plano assume existirem mas **não existem** — precisam ser criados como parte da etapa correspondente:

| Símbolo assumido | Usado em | Situação | Etapa dona |
|---|---|---|---|
| `generation_job_engine.count_active_for_user(user_id)` | quota | não existe | B5 |
| `generation_job_repository` contagem por status | quota | não existe | B5 |
| `generation_job_engine.add_usage(...)` / acúmulo de tokens | token tracking | não existe | B4 |
| `generation_job_engine.stream(job_id, from_seq=...)` | replay SSE | não existe | B10 |
| sequência (`event_seq`) por evento emitido | replay SSE | não existe | B10 |
| `components/three/index.ts` (barrel) | F3 original | **não criar** (inexistente e desnecessário) | F3 |
| `modernize_job_repository` como alvo de "persistir jobs" | B4 original | **ignorar** (arquivo errado, já persistido) | B4 |
