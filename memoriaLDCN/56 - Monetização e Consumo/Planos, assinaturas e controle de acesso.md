# Planos, assinaturas e controle de acesso

> **Status:** canônico. Fonte normativa única para internacionalização, teste gratuito, planos comerciais, assinaturas, elegibilidade estudantil, entitlements, limites e bloqueios do MLTagente.

## Internacionalização

Idiomas oficiais: `pt-BR` (padrão), `en-US`, `es-ES` e `fr-FR`. Todo texto exibido ou enviado pela plataforma usa chaves de tradução. Resolução: preferência salva pelo usuário → escolha na Landing Page → `Accept-Language` do navegador → `pt-BR`. Adicionar idioma não altera a lógica de negócio. Rotas públicas: `/{locale}/pricing`.

## Modelo comercial (BYOK)

O MLTagente não vende tokens de IA nem revende LLM. Toda chamada a OpenAI, Claude, Gemini, DeepSeek ou Groq usa a API Key própria do usuário, cadastrada em Configurações → Inteligência Artificial. A assinatura paga exclusivamente pela utilização da plataforma (Dashboard, Projetos, Workspaces, Blueprint, Prompt.md, Memória, Versionamento, Agentes, Build, Preview, Deploy, Marketplace, Templates, Organização, Colaboração, Atualizações) — nunca por créditos de IA, tokens ou chamadas a provedores de LLM. Não existe, e não está planejado, nenhum entitlement de "créditos de IA" fornecidos pela plataforma. Ver detalhes de arquitetura e segurança de chaves em [[Gestão de Chaves de IA (BYOK)]].

## Catálogo comercial

O teste é uma concessão temporária e não é um plano. Os planos comerciais são Estudante, Básico, Avançado e Pro — cada um é uma modalidade independente, com limites próprios (o Plano Estudante não é um desconto sobre o Básico).

| Modalidade | Público | Preço | Entitlements |
|---|---|---:|---|
| Teste Gratuito | conta nova | R$ 0 por 3 dias | conjunto `TRIAL` |
| Estudante | estudante matriculado aprovado | R$ 30/mês | limites próprios (ver tabela) |
| Básico | indivíduo | política comercial | limites próprios |
| Avançado | profissionais/equipes | política comercial | limites próprios |
| Pro | empresas/avançados | política comercial | limites próprios, alguns configuráveis |

### Teste gratuito

Duração de 72 horas, iniciada na criação da conta. Estados: `NOT_STARTED`, `ACTIVE`, `EXPIRED`, `CONVERTED`, `CANCELLED`. Campos: `trial_started_at`, `trial_expires_at`, `trial_status`, `trial_used`.

Cada usuário pode usar apenas um teste. A plataforma aplica controles de abuso configuráveis. Expirar não apaga conta, projetos, histórico, Prompt, Blueprint ou Builds.

Durante o teste: Chat de Criação, Prompt, Blueprint, projetos, builds, preview e IA (com a própria chave do usuário), sujeitos a limites `TRIAL`. Após expirar, leitura e contratação permanecem disponíveis; criação, agentes, builds, previews, publicação, IA, novos workspaces, convites e créditos ficam bloqueados. Avisos em `24h`, `6h`, `1h` e no vencimento, com contador regressivo e chaves localizadas.

### Planos

Limites são configuráveis em `plan_limits`, nunca constantes no código.

| Capacidade | Estudante | Básico | Avançado | Pro |
|---|---:|---:|---:|---:|
| `storage_bytes` | 2 GB | 10 GB | 50 GB | 200 GB |
| `active_projects` | 3 | 5 | 20 | 100 |
| `workspaces` | 1 | 2 | 10 | 50 |
| `members` | 1 | 1 | 5 | configurável |
| `preview_instances` | 1 | 1 | 3 | configurável |
| `monthly_builds` | limitado | limitado | maior | completo/configurável |

Todos os planos incluem criação de projetos, Prompt.md, Blueprint, Build, Preview, IA (via chave própria do usuário), histórico básico, Dashboard, versionamento e tradução completa. Avançado adiciona colaboração, múltiplos workspaces, automações, analytics, mais builds, rollback avançado, histórico maior e múltiplos previews. Pro inclui agentes, motores, automações, observabilidade, analytics avançado, API, Webhooks, integrações, Marketplace, publicação, histórico, auditoria e rollback completos. Apenas Enterprise futuro fica fora do Pro.

## Plano Estudante e elegibilidade

O Plano Estudante custa **R$ 30,00 por mês** e concede os recursos e limites próprios listados acima (2 GB, 3 projetos, 1 workspace). Exige comprovação de matrícula vigente em instituição reconhecida. Documentos aceitos são configuráveis: declaração/comprovante oficial, carteira estudantil válida, documento emitido pela instituição e outros aprovados.

Fluxo: conta → seleção → envio do comprovante → validação automática quando disponível → validação manual quando necessário → aprovação → assinatura ativada. Enquanto aguarda análise, o usuário pode usar o trial, se ainda elegível.

Estados: `PENDING_VERIFICATION`, `VERIFIED`, `REJECTED`, `EXPIRED`, `REVALIDATION_REQUIRED`. Revalidar a cada 12 meses por padrão, com prazo configurável; avisar antes do vencimento e pedir novo comprovante. Sem comprovação, cancelar apenas o Plano Estudante, preservando dados e permitindo migração para outro plano.

O benefício é pessoal, intransferível e limitado a uma modalidade por usuário. Indícios de fraude podem causar suspensão ou cancelamento conforme segurança e auditoria.

## Assinaturas e autorização

Estados: `TRIALING`, `ACTIVE`, `PAST_DUE`, `SUSPENDED`, `CANCELLED`, `EXPIRED`. A assinatura pertence à Organização, nunca diretamente ao usuário.

Autorização: `Usuário → Organização → Workspace → Subscription → Plano → Features → Limites → Permissões`. Role isolada nunca concede acesso comercial.

Features: `PROJECT_CREATE`, `PROJECT_DELETE`, `WORKSPACE_CREATE`, `PROMPT_GENERATE`, `BLUEPRINT_GENERATE`, `BUILD_EXECUTE`, `PREVIEW_CREATE`, `PATCH_APPLY`, `VERSION_RESTORE`, `DEPLOY_EXECUTE`, `AUTOMATION_EXECUTE`, `API_ACCESS`, `MARKETPLACE_ACCESS`, `ANALYTICS_ADVANCED`, `AI_OBSERVABILITY`.

Limites: `active_projects`, `workspaces`, `members`, `monthly_builds`, `storage_bytes`, `preview_instances`, `deployments`, `automation_executions`, `version_retention`.

Ao ativar/reativar, desbloquear imediatamente e preservar projetos, histórico, Prompt, Blueprint, Builds e versionamento.

## Contrato de erro

Negativas comerciais retornam `code`, `message` localizado, `details`, `correlation_id` e `timestamp`. Códigos: `TRIAL_EXPIRED`, `SUBSCRIPTION_REQUIRED`, `SUBSCRIPTION_INACTIVE`, `PLAN_FEATURE_NOT_AVAILABLE`, `PLAN_LIMIT_REACHED`, `PROJECT_LIMIT_REACHED`, `WORKSPACE_LIMIT_REACHED`, `BUILD_LIMIT_REACHED` e `PREVIEW_LIMIT_REACHED`.

## Persistência e eventos

Entidades: `plans`, `plan_features`, `plan_limits`, `subscriptions`, `subscription_history`, `trial_records`, `usage_records`, `billing_customers`, `billing_events` e registro versionado de elegibilidade estudantil com `student_status`, `student_verified_at`, `student_expires_at`, `student_document`, `student_validation_method`, `student_notes`.

Eventos: `TrialStarted`, `TrialExpirationWarningIssued`, `TrialExpired`, `TrialConverted`, `SubscriptionCreated`, `SubscriptionActivated`, `SubscriptionChanged`, `SubscriptionRenewed`, `SubscriptionCancelled`, `SubscriptionExpired`, `PlanLimitReached`, `PlanFeatureBlocked`, `UsageRecorded`, `StudentVerificationRequested`, `StudentVerificationApproved`, `StudentVerificationRejected`, `StudentVerificationExpired`, `StudentRevalidationRequested`, `StudentPlanActivated`, `StudentPlanCancelled`.

## Rastreabilidade

Produto, Monetização, Billing, Frontend Premium, UX, Onboarding, Domain Model, Language Model, Contratos, APIs, Banco Físico, Eventos, Estados, Permissões, MVP e a matriz de rastreabilidade devem referenciar este documento. Alterações futuras atualizam esta fonte e seus links, sem regras divergentes.
