# LDCN OS - Auditoria Completa do Sistema

**Data:** 2026-07-14  
**Branch auditada:** `feat/premium-foundation` (7 commits a frente de `origin`)  
**Escopo:** arquitetura, backend, frontend, mobile, agentes, pipeline de geracao, build, banco, seguranca, testes, tokens, memoria e documentacao.  
**Regra desta etapa:** nenhuma correcao foi aplicada. A unica alteracao produzida pela auditoria e este relatorio.

## 1. Resumo executivo

O LDCN OS tem uma base funcional extensa: API FastAPI autenticada, isolamento de ownership/workspaces nos fluxos principais, migracoes Alembic lineares, pipeline de agentes com checkpoints, frontend Next.js tipado, build de producao valido e uma suite backend ampla. O sistema, entretanto, **nao esta seguro para exposicao externa nem pronto para operacao de producao**.

O bloqueador principal e a execucao de comandos de projetos gerados/ingeridos diretamente no host. `npm install`, scripts definidos em `package.json`, `npx` e scripts Node podem executar codigo arbitrario com as permissoes do processo da API. A allowlist controla o nome inicial do comando, mas nao torna confiavel o codigo executado por npm/Node. Isso cria uma rota de RCE no servidor para usuarios autenticados.

Tambem foram confirmados: drift amplo entre modelos e banco, jobs executados em threads daemon sem fila duravel ou reconciliacao de startup, ausencia total de CI e infraestrutura implantavel, testes E2E usando o banco local real, ausencia de orcamento financeiro/de tokens por job, 389 `.env` reais em artefatos gerados, 195 textos fora do i18n, documentacao contraditoria e suporte mobile incoerente entre Flutter e Expo.

### Veredito por area

| Area | Estado | Sintese |
| --- | --- | --- |
| Arquitetura | Alto risco | Monolito modular amplo, mas com modulos gigantes, caminhos duplicados e infraestrutura apenas conceitual. |
| Backend | Funcional com bloqueadores | Boa cobertura e controles de ownership; execucao de codigo e durabilidade de jobs impedem producao. |
| Frontend | Funcional com divida alta | Build e typecheck passam; lint, i18n, bundle e encoding precisam de saneamento. |
| Mobile | Parcial/incoerente | Nao existe app mobile do LDCN OS; existe apenas capacidade de gerar mobile, com contrato Flutter/Expo divergente. |
| Agentes | Funcional local | Territorios, prompts e checkpoints existem; execucao e cache continuam presos ao processo. |
| Pipeline de geracao | Alto risco | Pipeline rico e recuperavel manualmente, mas caro, in-process e capaz de executar artefatos nao confiaveis. |
| Build | Passa localmente | Build web passa; nao ha build raiz, CI, container ou release reproduzivel. |
| Banco | Drift alto | Banco esta no head, mas `alembic check` detecta muitas diferencas entre schema e modelos. |
| Seguranca | Bloqueado | RCE no host, SSRF/DoS no ingest, hardening incompleto e artefatos sensiveis locais. |
| Testes | Cobertura ampla, gate fraco | 980 testes backend efetivamente passam; 151 E2E existem, mas nao sao isolados nem executados em CI. |
| Tokens | Sem controle financeiro | Uso real e contabilizado, mas nao ha quota total, teto monetario ou budget por job/tenant. |
| Memoria | Parcial | Contexto e memoria de projeto sao limitados; cache concorrente e jobs in-process limitam escala. |
| Documentacao | Drift critico | Fontes de verdade contradizem o runtime em BYOK, Git Export, auth, mobile e status de requisitos. |

## 2. Evidencias e validacoes executadas

- Inventario Git: 2.029 arquivos versionados; 373 no backend, 318 no frontend e 0 em `apps/mobile`.
- Worktree preexistente: cinco arquivos modificados no backend/testes. Eles nao foram alterados pela auditoria.
- Backend: `pytest -q -p no:cacheprovider` resultou em 973 passed, 1 skipped, 1 deselected e 7 erros de setup por ACL no temp global. Os 7 testes de artifact storage passaram em 0,11 s com `--basetemp C:\tmp\ldcn-audit-pytest`. Resultado funcional consolidado: **980 passed, 1 skipped, 1 deselected**.
- Banco: `alembic current` e `alembic heads` apontam `20260710_h1_oauth_accounts`; `alembic check` falha por drift de schema.
- Frontend: `npm run typecheck` passou; `npm run build` passou em Next.js 15.5.18.
- Lint: 0 errors e 61 warnings.
- I18n: 195 findings em 17 arquivos; o comando de check retorna falha quando executado isoladamente.
- Tipografia: 9 violacoes em 5 arquivos; o script sempre retorna exit code 0.
- Dependencias web: `npm audit --omit=dev` encontrou 2 vulnerabilidades moderadas via PostCSS/Next.
- Playwright: 151 testes em 38 arquivos enumerados. Nao executados nesta auditoria porque a configuracao inicia a API contra o SQLite local e ha cenarios que registram usuarios e salvam projetos sem cleanup.
- Banco local: 202.706.944 bytes, 15 tabelas, 308 usuarios, 645 refresh tokens, 59 projetos, 14 generation jobs e 1.466 audit logs. Apenas nomes de tabelas e contagens foram lidos. O arquivo e ignorado por `apps/api/.gitignore` e nao aparece no historico Git.
- Artefatos: 634 arquivos em `generated-projects` continuam rastreados no Git apesar da regra atual de ignore; ha 389 arquivos `.env` reais no workspace. Nenhuma assinatura conhecida de chave real foi detectada.

## 3. Problemas priorizados

### AUD-001 - Execucao remota de codigo no host por projetos nao confiaveis

**Prioridade:** P0 - bloqueador de seguranca  
**Impacto:** comprometimento do host, leitura de secrets/DB, movimento lateral, destruicao ou exfiltracao de dados. Um usuario autenticado pode produzir/ingerir um projeto com lifecycle scripts ou scripts npm maliciosos e acionar build/terminal. `shell=False` e a allowlist nao protegem contra codigo executado por `npm install`, `npm run`, `npx` ou `node script.js`.  
**Arquivos envolvidos:**

- `apps/api/app/services/execution_terminal_service.py:25-47, 103-130, 187-231`
- `apps/api/app/services/build_validation_service.py:309-339, 472-477, 999-1135`
- `apps/api/app/routes/meta_factory.py:1026-1055, 1082-1170`
- `apps/api/app/services/codebase_ingest_service.py`

**Plano de correcao:**

1. Desabilitar terminal e build remoto por feature flag ate existir isolamento real.
2. Executar cada build em sandbox descartavel: container/VM sem privilegios, filesystem dedicado read-only fora do workspace, usuario sem acesso aos secrets da API, limites de CPU/RAM/PIDs/disco/tempo e rede negada por padrao.
3. Separar o worker de build do processo da API e usar fila duravel.
4. Bloquear lifecycle scripts por padrao (`--ignore-scripts`) e habilita-los apenas em ambiente descartavel explicitamente aprovado.
5. Tratar todos os arquivos gerados, uploads, repositorios e manifests como entrada hostil.
6. Adicionar testes de escape, exfiltracao, fork bomb, package lifecycle e acesso ao workspace pai.

### AUD-002 - Ingestao Git/ZIP permite SSRF e abuso severo de recursos

**Prioridade:** P1 - alta  
**Impacto:** acesso a hosts internos via `git clone`, consumo de rede/disco/CPU, esgotamento de workers e indisponibilidade. URLs HTTPS/SSH arbitrarias sao aceitas; os defaults permitem upload comprimido de 4 GB, codigo analisavel de 2 GB e ratio ZIP de 1000, sem limite de quantidade de entradas.  
**Arquivos envolvidos:**

- `apps/api/app/services/codebase_ingest_service.py:160-307, 420-455`
- `apps/api/app/routes/modernize.py:159-184, 572-621`
- `apps/api/app/core/config.py:224-240`

**Plano de correcao:**

1. Resolver DNS e bloquear loopback, link-local, redes privadas, metadata cloud e redirecionamentos para faixas proibidas.
2. Permitir hosts Git conhecidos ou usar integracao de provider autenticada.
3. Reduzir limites globais e definir quotas por usuario/tenant.
4. Limitar numero de entradas, tamanho total declarado, profundidade, nomes e tempo de varredura antes da extracao.
5. Mover clone/extracao para worker isolado sem acesso ao plano de controle.

### AUD-003 - Nao existe ambiente de producao reproduzivel nem CI

**Prioridade:** P1 - alta  
**Impacto:** nao ha caminho auditavel de build, teste, deploy, rollback ou scan. O projeto possui 0 workflows CI, 0 Dockerfiles, 0 compose, 0 `pyproject.toml`, 0 configuracao de cobertura e nenhum manifest raiz de workspace. Os diretorios `infrastructure/*` sao placeholders.  
**Arquivos envolvidos:**

- `infrastructure/ci/README.md`
- `infrastructure/docker/README.md`
- `infrastructure/deployment/README.md`
- `infrastructure/monitoring/README.md`
- `scripts/dev.mjs`
- `apps/api/requirements.txt`
- `apps/web/package.json`

**Plano de correcao:**

1. Criar pipeline CI com lint, typecheck, unit, integration, migration check, build, secret scan, SCA e E2E isolado.
2. Criar imagens separadas para API, web e workers, com usuarios non-root e healthchecks.
3. Definir configuracao de producao, migrations como etapa controlada, backup/restore e rollback.
4. Criar comando raiz unico para gates e matriz de ambientes suportados.

### AUD-004 - Drift amplo entre modelos SQLAlchemy e schema migrado

**Prioridade:** P1 - alta  
**Impacto:** deploys podem falhar ou produzir comportamento diferente entre bancos novos, SQLite existente e PostgreSQL. `alembic check` detectou indices ausentes, nulabilidade/tipos divergentes, FK divergente e colunas legadas em `projects`.  
**Arquivos envolvidos:**

- `apps/api/app/models/persistence.py`
- `apps/api/app/models/user.py`
- `apps/api/app/models/tenant.py`
- `apps/api/alembic/versions/*.py`
- `apps/api/alembic/env.py`

**Plano de correcao:**

1. Classificar falsos positivos especificos de SQLite versus drift real.
2. Gerar migracao revisada manualmente, sem aceitar `autogenerate` cegamente.
3. Testar upgrade de copia sanitizada, banco vazio e PostgreSQL.
4. Tornar `alembic check` gate obrigatorio de CI.

### AUD-005 - Jobs nao sao duraveis como execucao e podem ficar orfaos

**Prioridade:** P1 - alta  
**Impacto:** restart encerra threads daemon no meio do job; nao ha reconciliacao no lifespan para marcar `QUEUED/*_RUNNING` como recuperavel. Jobs orfaos continuam contando no limite de concorrencia e exigem intervencao manual. Multi-instancia pode iniciar trabalho sem coordenacao distribuida.  
**Arquivos envolvidos:**

- `apps/api/app/engines/generation_job_engine.py:178-233, 248-357`
- `apps/api/app/engines/agent_executor.py`
- `apps/api/app/repositories/generation_job_repository.py:109-139`
- `apps/api/app/main.py:58-63`

**Plano de correcao:**

1. Substituir threads daemon por fila duravel com lease, heartbeat, retry idempotente e dead-letter.
2. Adicionar reconciliacao de startup e expiracao de leases.
3. Persistir identidade da tentativa e usar compare-and-swap nas transicoes.
4. Separar API, orquestracao LLM e build workers.

### AUD-006 - Sem orcamento total de tokens, custo ou quota por tenant

**Prioridade:** P1 - alta  
**Impacto:** custo imprevisivel e cost-DoS. Um full-stack permite ate 224 mil tokens de saida por rodada dos sete agentes; com tres tentativas, o teto teorico chega a 672 mil tokens de saida, sem incluir orchestrator, verificacao, repair e entradas. Ha limite de concorrencia e rate limit, mas nao ha budget total por job/dia/tenant nem interrupcao por custo.  
**Arquivos envolvidos:**

- `apps/api/app/engines/factory_pipeline.py:41-101, 132-243`
- `apps/api/app/engines/context_pack_builder.py:24-38, 118-123`
- `apps/api/app/repositories/generation_job_repository.py:141-198`
- `apps/api/app/core/config.py:130-141, 192-208`
- `apps/web/components/generation/ai-usage-card.tsx`

**Plano de correcao:**

1. Definir budgets de input, output, custo e wall-clock por job, usuario e workspace.
2. Reservar budget atomicamente antes de cada chamada e reconciliar com usage real.
3. Interromper retries quando o ganho esperado nao justifica o budget restante.
4. Exibir estimativa antes da confirmacao e custo/usage por etapa depois da execucao.
5. Usar tokenizador do provider/modelo em vez de `len(text)//4` para enforcement.

### AUD-007 - Testes E2E usam e poluem o banco local real

**Prioridade:** P1 - alta  
**Impacto:** executar Playwright cria usuarios e projetos em `apps/api/app/data/ldcn_os.db`, mistura teste com dados locais, torna resultados dependentes da ordem e explica o crescimento de usuarios/tokens. Nao ha cleanup global nem `LDCN_DATABASE_URL` isolado no `webServer`.  
**Arquivos envolvidos:**

- `apps/web/playwright.config.ts:15-28`
- `apps/web/tests/wizard-system-flow.spec.ts:60+`
- `apps/web/tests/architectural-graph.spec.ts:83-123`
- `apps/web/tests/wizard-flow-helpers.ts`
- `apps/api/app/data/ldcn_os.db` (ignorado pelo Git)

**Plano de correcao:**

1. Criar SQLite/PostgreSQL temporario por run e passar `LDCN_DATABASE_URL` ao webServer.
2. Executar migrations no setup e destruir banco/artefatos no teardown.
3. Impedir `reuseExistingServer` em CI ou validar que o server aponta para ambiente de teste.
4. Adicionar guard que recusa E2E quando a URL do banco nao contem identificador de teste.

### AUD-008 - Artefatos gerados e arquivos de ambiente sem governanca suficiente

**Prioridade:** P1 - alta  
**Impacto:** 634 arquivos antigos de `generated-projects` permanecem rastreados apesar do ignore atual; o workspace contem 389 `.env` reais e 373 deles possuem valores longos nao classificados como placeholders. Nenhuma assinatura conhecida de chave real foi encontrada e o ZIP atual exclui nomes/conteudos sensiveis, mas a superficie local, backup e manutencao e grande.  
**Arquivos envolvidos:**

- `generated-projects/**`
- `.gitignore:56`
- `apps/api/app/services/generated_project_service.py:100-148, 166-230`
- `apps/api/app/engines/generated_project_quality_engine.py:464-495`
- `apps/api/app/services/project_writer.py`

**Plano de correcao:**

1. Inventariar e sanitizar artefatos existentes antes de qualquer remocao do Git.
2. Separar fixtures versionadas de runtime output; manter apenas fixtures minimas e anonimas.
3. Impedir materializacao de `.env` real; gerar somente `.env.example` e injetar secrets fora do projeto.
4. Definir TTL, quota, limpeza segura e storage por tenant.
5. Aplicar secret scanner dedicado no write, ZIP, Git export e CI.

### AUD-009 - Hardening de producao incompleto

**Prioridade:** P1 - alta  
**Impacto:** producao exige secret JWT, Redis, PostgreSQL e S3, mas nao exige chave de criptografia dedicada, tamanho minimo de secrets, URLs HTTPS ou origem/host confiavel. OAuth monta callback com `request.base_url` e nao ha TrustedHostMiddleware. A mesma chave pode voltar a proteger JWT e credenciais por fallback legado.  
**Arquivos envolvidos:**

- `apps/api/app/core/config.py:46-105, 244-271`
- `apps/api/app/core/security.py:35-70`
- `apps/api/app/routes/auth.py:107-175`
- `apps/api/app/core/cors.py`
- `apps/api/app/main.py`

**Plano de correcao:**

1. Exigir `LDCN_TOKEN_ENC_KEY` independente e secrets com entropia minima em producao.
2. Validar HTTPS para frontend, callbacks e origens publicas.
3. Configurar hosts confiaveis e estrategia explicita de proxy headers.
4. Planejar rotacao/versionamento de chaves cifradas.
5. Adicionar testes de Host header, proxy spoofing, CORS, CSRF e rotacao.

### AUD-010 - Observabilidade de producao e infraestrutura operacional ausentes

**Prioridade:** P1 - alta  
**Impacto:** `/metrics` e deliberadamente omitido em producao, enquanto `infrastructure/monitoring` e placeholder. Nao ha tracing distribuido, dashboards, alertas, SLOs ou runbooks. Jobs longos e builds nao podem ser operados com seguranca sem telemetria.  
**Arquivos envolvidos:**

- `apps/api/app/main.py:100-103`
- `apps/api/app/core/metrics.py`
- `apps/api/app/core/logging.py`
- `infrastructure/monitoring/README.md`
- `infrastructure/deployment/README.md`

**Plano de correcao:**

1. Expor metrics em interface privada/autenticada para o scraper, inclusive em producao.
2. Adicionar metricas por fila, etapa, provider, tokens, custo, build, erro e saturacao.
3. Implementar tracing com correlation IDs entre API, job, provider e build worker.
4. Definir SLOs, alertas e runbooks de job travado, Redis/S3/DB e custo anormal.

### AUD-011 - Suporte mobile possui contrato contraditorio

**Prioridade:** P1 - alta  
**Impacto:** nao existe aplicativo mobile do LDCN OS. A plataforma oferece geracao mobile, mas o Architect aceita `flutter`, enquanto o agente mobile, territorios, quality gates e execution plan estao orientados a Expo/React Native; o proprio plano declara Flutter indisponivel. O usuario pode aprovar uma stack que o pipeline nao consegue entregar coerentemente.  
**Arquivos envolvidos:**

- `apps/api/app/engines/architect_engine.py:143-193`
- `apps/api/app/engines/agent_prompts.py:85-108, 252-262, 443-447`
- `apps/api/app/engines/execution_plan_engine.py:46-50`
- `apps/api/app/data/agent_territories.py`
- `apps/api/app/engines/generated_project_quality_engine.py`
- `apps/web/app/(app)/project-rooms/new/page.tsx`

**Plano de correcao:**

1. Decidir se Flutter e suportado agora, experimental ou futuro.
2. Se futuro, rejeitar Flutter no contrato/Architect e comunicar indisponibilidade antes da aprovacao.
3. Se suportado, criar prompt, parser, territorios, build, quality gates e testes Flutter completos.
4. Separar claramente “frontend responsivo” de “aplicativo mobile gerado”.

### AUD-012 - Documentacao contradiz o runtime e nao funciona como fonte de verdade

**Prioridade:** P1 - alta  
**Impacto:** operadores e desenvolvedores recebem instrucoes erradas. O ledger diz `no BYOK`, enquanto User Key Boost esta implementado; quickstart e docs de arquitetura dizem que Git Export/User Key retornam 501, mas existem rotas e servicos ativos; README chama User Key de planejado; status do ledger permanece `planned`; URLs localhost/127.0.0.1 divergem.  
**Arquivos envolvidos:**

- `docs/06-master-requirements-ledger.md:169-176, 245-276`
- `docs/quickstart.md:56-61`
- `docs/standards/secret-handling.md:30-33`
- `docs/architecture/user-key-boost.md`
- `docs/architecture/git-export.md`
- `README.md:39-75`
- `apps/api/app/routes/user_ai_keys.py`
- `apps/api/app/routes/git_export.py`
- `apps/api/app/routes/git_providers.py`

**Plano de correcao:**

1. Registrar decisao formal de BYOK versus platform key.
2. Gerar inventario de features/endpoints a partir do runtime e reconciliar documentos.
3. Atualizar ledger com `implemented/validated` apenas quando houver evidencia de gate.
4. Adicionar teste de links, comandos e exemplos de configuracao.

### AUD-013 - Mojibake em strings de UI, diagnosticos e comentarios

**Prioridade:** P1 - alta para UX/operacao  
**Impacto:** separadores, setas, acentos e mensagens de recuperacao aparecem corrompidos; diagnosticos persistidos podem ficar ilegíveis. Foram encontradas 72 ocorrencias de sequencias suspeitas.  
**Arquivos envolvidos:**

- `apps/web/app/(app)/meta-factory/page.tsx:321, 702, 781, 837, 1015, 1115`
- `apps/web/app/(app)/project-rooms/[roomId]/page.tsx:165, 221`
- `apps/api/app/engines/generation_job_engine.py:44, 1514, 1551`
- `apps/api/app/routes/meta_factory.py:120, 1094, 1213`
- `apps/api/app/routes/modernize.py:564`

**Plano de correcao:**

1. Fixar encoding UTF-8 no editor, Git, Python, Node e console.
2. Corrigir strings fonte com testes de snapshot/JSON UTF-8.
3. Auditar dados persistidos ja corrompidos antes de migrar.

### AUD-014 - Qualidade frontend nao e bloqueante

**Prioridade:** P2 - media  
**Impacto:** regressao de renderizacao/performance e quebra do requisito de localizacao. O lint aceita 61 warnings; ha 195 textos hardcoded e 9 violacoes tipograficas. O script de tipografia sempre retorna 0 e o relatorio salvo afirma 0 violacoes, embora o scan atual encontre 9.  
**Arquivos envolvidos:**

- `apps/web/eslint.config.mjs`
- `apps/web/scripts/audit-hardcoded-i18n.mjs`
- `apps/web/scripts/audit-typography.mjs`
- `apps/web/reports/typography_audit.md`
- `apps/web/app/(app)/wizard/page.tsx` (3.567 linhas)
- arquivos listados pelos scans em `apps/web/app` e `apps/web/components`

**Plano de correcao:**

1. Tornar warnings selecionados erros e aplicar baseline temporario explicito para migracao.
2. Fazer auditoria tipografica falhar com findings.
3. Remover hardcodes via dicionarios e adicionar validacao de paridade entre quatro locales.
4. Adicionar axe/accessibility e testes visuais deterministas em CI.

### AUD-015 - Hotspots e responsabilidades excessivas

**Prioridade:** P2 - media  
**Impacto:** manutencao lenta, alto risco de regressao e contexto excessivo para humanos/agentes. Ha paginas/servicos entre 1.000 e 3.567 linhas e rotas que misturam autorizacao, orquestracao, streaming, build, export e governanca.  
**Arquivos envolvidos:**

- `apps/web/app/(app)/wizard/page.tsx` - 3.567 linhas
- `apps/api/app/services/framework_specialist_service.py` - 2.142 linhas
- `apps/api/app/engines/generation_job_engine.py` - 1.576 linhas
- `apps/api/app/routes/meta_factory.py` - 1.297 linhas
- `apps/api/app/services/build_validation_service.py` - 1.091 linhas
- `apps/api/app/engines/llm/mock_adapter.py` - 1.062 linhas
- `apps/web/app/(app)/meta-factory/page.tsx` - 1.062 linhas

**Plano de correcao:**

1. Definir boundaries por caso de uso, sem refatoracao cosmetica.
2. Extrair state machines, policies e adapters puros com contratos/testes.
3. Unificar os caminhos legacy stream, job pipeline e build sob uma unica orquestracao.
4. Dividir paginas por feature/state hook e componentes de fluxo.

### AUD-016 - Dependencias nao totalmente reproduziveis e vulnerabilidades conhecidas

**Prioridade:** P2 - media  
**Impacto:** builds variam ao longo do tempo e podem incorporar vulnerabilidades. O npm encontrou 2 vulnerabilidades moderadas em PostCSS via Next. O app instala Next 15.5.18 com `eslint-config-next` 16.2.10. Muitas dependencias Python usam `>=`, sem lock/hashes; nao ha `pip-audit` instalado nem scan Python automatizado.  
**Arquivos envolvidos:**

- `apps/web/package.json:18-46`
- `apps/web/package-lock.json`
- `apps/api/requirements.txt`

**Plano de correcao:**

1. Alinhar major versions de Next e eslint-config-next.
2. Atualizar PostCSS/Next por caminho suportado, validando build/E2E.
3. Adotar lock Python com hashes e separar runtime/dev/test.
4. Executar npm/pip/OSV audit em CI com politica de severidade e SLA.

### AUD-017 - Cache LLM nao e protegido para concorrencia e tem budget apenas por quantidade

**Prioridade:** P2 - media  
**Impacto:** `OrderedDict` global sofre acessos de varias threads sem lock; entradas podem conter respostas muito grandes e o limite de 256 nao considera bytes. O cache e por processo, sem TTL, isolamento por tenant ou observabilidade de memoria/hit rate.  
**Arquivos envolvidos:**

- `apps/api/app/engines/llm/response_cache.py`
- `apps/api/app/engines/agent_executor.py`
- `apps/api/app/engines/llm/router.py:156-179`
- `apps/api/app/engines/llm_repair_engine.py:113`
- `apps/api/app/engines/verification_engine.py:141`

**Plano de correcao:**

1. Proteger operacoes compostas com lock ou cache concorrente testado.
2. Limitar por bytes e TTL; medir hit/miss/eviction/memoria.
3. Incluir versao de prompt/schema/policy na chave.
4. Decidir explicitamente escopo por tenant e estrategia distribuida.

### AUD-018 - Cobertura de testes nao e medida e E2E nao e gate

**Prioridade:** P2 - media  
**Impacto:** quantidade alta de testes nao comprova cobertura dos riscos principais. Nao existe coverage config, CI, teste de sandbox hostil ou matriz PostgreSQL/Redis/S3 real. A suite backend leva cerca de 9m22s e mistura testes rapidos/lentos sem profiles.  
**Arquivos envolvidos:**

- `apps/api/tests/**`
- `apps/web/tests/**`
- `apps/web/playwright.config.ts`
- `docs/05-quality-gates.md`

**Plano de correcao:**

1. Separar unit, integration, security, contract e E2E com markers e budgets de duracao.
2. Medir cobertura por risco/modulo, nao apenas percentual global.
3. Criar testes PostgreSQL/Redis/S3 em containers efemeros.
4. Adicionar testes adversariais para RCE, SSRF, zip bomb, tenancy, secrets e crash recovery.

### AUD-019 - Build passa com bundle inicial alto e configuracao permissiva

**Prioridade:** P2 - media  
**Impacto:** rotas principais carregam 284-386 kB de First Load JS; `/wizard` chega a 386 kB e `/modernize` a 367 kB. `allowJs` e `skipLibCheck` reduzem sinal do type system. Cenas 3D e bibliotecas pesadas exigem particionamento disciplinado.  
**Arquivos envolvidos:**

- `apps/web/tsconfig.json:9-22`
- `apps/web/package.json`
- `apps/web/app/(app)/**/page.tsx`
- `apps/web/components/three/**`

**Plano de correcao:**

1. Gerar bundle report e budgets por rota no CI.
2. Lazy-load de 3D, editores, graficos e paineis raros.
3. Reduzir componentes client-only e mover derivacoes estaticas ao server quando aplicavel.
4. Remover `allowJs`/`skipLibCheck` quando dependencias permitirem.

### AUD-020 - API de downloads e catalogos possuem legado/dead surface

**Prioridade:** P3 - baixa  
**Impacto:** `/downloads` autenticado retorna uma lista global estatica vazia (`DOWNLOADS = []`), sem ownership, persistencia ou ligacao com os downloads reais preparados por projeto. A superficie confunde contrato e observabilidade.  
**Arquivos envolvidos:**

- `apps/api/app/routes/downloads.py`
- `apps/api/app/services/download_service.py`
- `apps/api/app/repositories/download_repository.py`
- `apps/api/app/data/foundation.py:590`
- `apps/web/lib/api/client.ts`

**Plano de correcao:**

1. Remover/deprecar a rota ou conecta-la a registros reais owner-scoped.
2. Definir contrato de auditoria de download com tenant, artefato, checksum e expiracao.

## 4. Pontos positivos confirmados

- Routers operacionais exigem JWT; health/auth/localization sao explicitamente publicos.
- Access token fica apenas em memoria no frontend; refresh token usa cookie HttpOnly, SameSite Lax e Secure em producao.
- Repositorios de projetos, rooms, generation jobs e modernize aplicam owner/workspace scoping nos fluxos principais.
- Senhas usam bcrypt e refresh tokens sao rotacionados/revogaveis.
- Credenciais de provider sao cifradas em repouso e nao sao retornadas diretamente ao frontend.
- Path traversal e Zip Slip possuem validacoes dedicadas.
- Download/ZIP exclui nomes e conteudos classificados como sensiveis.
- Pipeline registra checkpoints, usage real, diagnosticos, estado terminal e suporta recuperacao manual.
- Context Pack limita contexto por papel e Project Memory injeta apenas fatias recentes.
- Build web e typecheck passam no estado auditado.
- A suite backend tem cobertura funcional ampla e todos os erros observados foram reproduzidos como problema de ACL do temp, nao falhas de assertiva.

## 5. Sequencia recomendada de correcao

### Fase 0 - Contencao imediata

1. Bloquear build/terminal remoto e Modernize externo em qualquer ambiente acessivel por terceiros.
2. Nao implantar o sistema publicamente antes de isolar execucao de codigo.
3. Preservar evidencias e inventariar `.env`/artefatos sem apagar dados nesta etapa.

### Fase 1 - Seguranca e durabilidade

1. Criar worker sandboxed e fila duravel.
2. Corrigir SSRF/quotas de ingest e hardening de producao.
3. Isolar E2E e reconciliar jobs apos restart.
4. Resolver drift Alembic com testes SQLite/PostgreSQL.

### Fase 2 - Gates de entrega

1. Implantar CI, containers, SCA, secret scan e coverage.
2. Definir budgets de token/custo e observabilidade de jobs.
3. Corrigir dependencias vulneraveis e reproducibilidade.

### Fase 3 - Coerencia de produto

1. Decidir BYOK e suporte Flutter.
2. Reconciliar ledger, README, quickstart e docs de arquitetura.
3. Corrigir mojibake, i18n, tipografia e warnings React.

### Fase 4 - Manutenibilidade e performance

1. Dividir hotspots por boundaries de caso de uso.
2. Unificar caminhos de pipeline e clientes API.
3. Aplicar budgets de bundle e otimizar carregamento do frontend.

## 6. Criterios para aprovar implementacao posterior

Antes de iniciar correcoes, recomenda-se aprovar explicitamente:

1. **Modelo de isolamento:** container local, worker remoto ou microVM.
2. **Politica de providers:** BYOK, platform key ou ambos, com ownership de custo.
3. **Escopo mobile:** apenas Expo agora ou Flutter completo.
4. **Target de producao:** single-node local, SaaS multi-tenant ou ambos.
5. **Politica de retencao:** banco, prompts, respostas brutas, `.env`, builds, ZIPs e logs.

Nenhuma implementacao foi realizada. Este documento e o gate de decisao para a proxima etapa.
