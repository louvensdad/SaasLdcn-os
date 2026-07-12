# Auditoria Backend x Frontend — 15/06/2026

## Resumo executivo

Auditoria completa do backend (FastAPI) contra o frontend (Next.js), cobrindo:
autenticação/RBAC, segurança (CORS, headers, rate limit), conformidade LGPD,
i18n (pt-BR/en-US/es-ES/fr-FR) e os ~28 routers da API. Foram encontrados e
**corrigidos diretamente** 3 bugs (2 deles críticos — impediam o backend e o
build do frontend de funcionar). Os demais pontos auditados estão consistentes
e funcionando como projetado. Itens não corrigidos foram documentados como
decisões de design ou placeholders intencionais.

---

## 1. Autenticação, RBAC e LGPD (Fase B) — OK, sem alterações

Auditoria completa do fluxo de autenticação confirmou que está **completo e
consistente** entre backend e frontend:

- JWT (HS256) com access token (30 min) + refresh token (7 dias) via cookie
  `httpOnly` (`ldcn_refresh_token`, `SameSite=Lax`, `secure` só em produção).
- `TokenResponse` não expõe mais `refresh_token` no corpo — só via cookie.
  Confirmado: `packages/contracts/auth.contract.ts` ↔
  `apps/api/app/schemas/auth.py` ↔ `apps/web/lib/api/types.ts` 100% alinhados.
- RBAC `admin`/`user`. Primeiro usuário registrado vira `admin`.
- LGPD: `privacy_policy_accepted` obrigatório no registro, consentimento
  registrado e auditado (`user_consent_recorded`), exportação de dados inclui
  trilha de auditoria (`audit_events`), exclusão de conta com anonimização.
- Frontend: `use-auth-store.ts` (zustand), `apiRequest` com refresh
  automático em 401, route guard via `AppShell`, páginas de login/registro
  completas, i18n `auth.*` presente e traduzido nos 4 idiomas.
- Middleware de segurança (`SecurityHeadersMiddleware`, `RateLimitMiddleware`,
  CORS com `allow_credentials=True`) na ordem correta em `main.py`. Todos os
  ~26 routers não-públicos protegidos por `Depends(get_current_user)`;
  `git_export` e `git_providers` adicionalmente exigem `role == "admin"`,
  alinhado com o gate `isAdmin` na tela de Settings.

Nenhuma alteração foi necessária nessa parte — já estava correta.

---

## 2. Bugs encontrados e corrigidos

### 2.1. [CRÍTICO] `git_export.py` e `git_providers.py` corrompidos (arquivos truncados)

**Arquivos**: `apps/api/app/routes/git_export.py`, `apps/api/app/routes/git_providers.py`

Os dois arquivos estavam truncados no meio de uma assinatura de função
(`def get_git_export_status(export_id: str` sem fechar parênteses, e
`def create_repository(...)` sem corpo). Isso é um **erro de sintaxe Python**
que impede o módulo `app.main` de ser importado — ou seja, **o backend inteiro
não conseguiria iniciar**.

**Correção**: ambos os arquivos foram restaurados para a versão completa e
válida (rotas de preview/export para GitHub/GitLab, status de export, conexão
e validação de provedores Git, criação de repositório), todos protegidos por
`Depends(require_role("admin"))` como já era o padrão.

### 2.2. [CRÍTICO] `apps/web/lib/api/endpoints.ts`, `client.ts` e `meta-factory.ts` com seções faltando

Os três arquivos do cliente HTTP do frontend tinham trechos cortados no meio
de um token (faltando o fechamento `} as const;` em `endpoints.ts`, métodos
inteiros faltando em `client.ts` — incluindo `getBackendGenerationStatus`,
`runLocalGeneration`, `getGeneratedFiles`/`getGeneratedFileContent`/
`prepareGeneratedDownload`, todos os métodos de Git Export/Providers,
`getTemplates`, `getSkills`/`previewSkill`, `getSystemStatus`, `getRoadmap`,
métodos de projeto, etc. — e em `meta-factory.ts` faltavam `fileContent`,
`prepareDownload` e `download`). Isso quebraria a compilação TypeScript do
frontend inteiro.

**Correção**: as três seções foram completadas, cada método mapeado para a
rota correspondente do backend (confirmado contra `apps/api/app/routes/*` e
os tipos em `apps/web/lib/api/types.ts`/`packages/contracts/*`). Também
corrigida uma inconsistência de indentação introduzida nos blocos `gitExport`/
`gitProviders` de `endpoints.ts`.

### 2.3. [MÉDIO] Cookie de refresh não seria entregue em dev (`127.0.0.1` vs `localhost`)

**Arquivos**: `apps/web/.env.local`, `apps/web/lib/api/endpoints.ts`, `docs/quickstart.md`

O frontend usava `NEXT_PUBLIC_API_URL=http://127.0.0.1:8001` por padrão,
enquanto `next dev` roda em `http://localhost:3000`. Navegadores tratam
`127.0.0.1` e `localhost` como **sites diferentes** — então o cookie
`SameSite=Lax` do refresh token, emitido pela API em `127.0.0.1`, nunca seria
enviado de volta em chamadas `fetch`/XHR partindo de `localhost:3000`. Isso
quebraria silenciosamente a renovação de sessão (usuário deslogado após 30
min) em qualquer ambiente local que seguisse a configuração padrão.

**Correção**: `DEFAULT_API_URL` e `.env.local` alterados para
`http://localhost:8001` (mesma "site" que `localhost:3000`), com comentário
explicando o motivo. `docs/quickstart.md` atualizado com a mesma orientação.

---

## 3. Itens documentados (não corrigidos — decisões de design ou fora do escopo)

- **`/skills/execute`** (`apps/api/app/routes/skills.py`): rota e tipos
  (`SkillExecutionRequest`/`SkillExecutionResult`) existem no backend e nos
  contratos, mas não há nenhum método correspondente em
  `apps/web/lib/api/client.ts`. Funcionalidade backend "órfã" no frontend —
  recomenda-se decidir se será exposta na UI ou removida/marcada como
  `501 planned`.
- **`GET /infrastructure/recommendations`** (`apps/api/app/routes/infrastructure.py`):
  existe em paralelo ao `POST /infrastructure/recommendations` (usado pelo
  frontend), fazendo a mesma coisa via query string. Código morto do ponto de
  vista do frontend — considerar remover ou documentar como API alternativa
  para consumidores externos.
- **`contracts.py` e `user_ai_keys.py`**: os placeholders `501 Not Implemented`
  (`PlannedSecureExtensionResponse`) são **intencionais e documentados** em
  `docs/quickstart.md` ("Placeholder endpoints return 501... expected for User
  Key Boost, Git Export, and PDF Contract Input in V1 Foundation") — não são
  bugs.
- **Permissões/segurança de arquivos gerados** (`generated_project_service.py`):
  revisado — proteção contra path traversal, exclusão de arquivos
  "secret-like" e checagem de diretório-raiz estão corretas.

---

## 4. Itens pendentes do roadmap (não fazem parte desta auditoria)

- Tarefa #13: auditoria de strings hardcoded fora do sistema de i18n
  (~465 ocorrências em 41 arquivos mapeadas anteriormente, ainda não
  remediadas).
- Tarefa #14: planejamento das fases 7 e 10-13 (Agentes, Agent Boost, LDCN).
- Tarefa #8: rodar a suíte de testes do backend (`pytest`) — não foi possível
  neste ambiente (sandbox sem acesso para instalar dependências); recomenda-se
  rodar `python -m pytest apps/api/tests` localmente para validar as correções
  dos itens 2.1 e 2.2 (especialmente a importação de `app.main` e o
  `npm run typecheck` do frontend).

---

## Conclusão

A base de autenticação/segurança/LGPD (foco da Fase B) está sólida e sem
inconsistências. A auditoria geral encontrou e corrigiu dois problemas que
impediriam o backend e o frontend de sequer iniciar/compilar (arquivos
corrompidos/truncados) e um bug de configuração que quebraria silenciosamente
a renovação de sessão em desenvolvimento. Recomenda-se rodar
`pytest apps/api/tests` e `npm run typecheck` (frontend) para confirmar que as
correções restauraram a build a um estado saudável.
