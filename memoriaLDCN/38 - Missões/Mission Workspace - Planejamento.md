---
title: LDCN OS — Mission Workspace
aliases:
  - Mission Workspace
  - Ambiente Universal de Execução Guiada
status: planejamento
version: "1.0"
type: especificacao-de-produto
tags:
  - ldcn-os
  - missoes
  - wizard
  - planejamento
  - ia
---

# LDCN OS — Mission Workspace

> [!abstract] Status do documento
> Planejamento conceitual e técnico para a evolução futura do `/wizard`. Este arquivo não representa funcionalidade implementada.

## Visão geral

O `/wizard` atual funciona como um formulário de coleta de requisitos para software. O **Mission Workspace** é a proposta de transformá-lo em um ambiente no qual o usuário resolve problemas técnicos ou operacionais acompanhado por uma IA especializada.

```text
Antes: usuário preenche formulário → IA gera software
Futuro: usuário define uma missão → sistema monta a jornada → IA participa de todo o processo
```

O resultado de uma missão pode ser código, relatório, workflow, plano, diagnóstico, documentação, comparação tecnológica, blueprint ou automação.

## Objetivo

Permitir que qualquer usuário entre com um problema técnico ou operacional e saia com um entregável utilizável, sem precisar abandonar a plataforma para descobrir o próximo passo.

## Modelo mental

Toda interação começa com uma **missão**, composta por:

- **Tipo:** resultado que o usuário deseja alcançar.
- **Genome:** etapas, especialistas, validações e entregáveis do tipo de missão.
- **Contexto:** textos, arquivos, código, logs, URLs e demais materiais fornecidos.
- **Memória:** decisões, rejeições, justificativas e alterações registradas.
- **Jornada:** sequência adaptativa de etapas daquela missão.
- **Entregáveis:** resultados produzidos ao final.

## Escopo do Mission Registry

### Criar

| ID | Missão |
|---|---|
| `software.build` | Criar software, app ou API |
| `automation.create` | Criar automação ou workflow |
| `agent.create` | Criar agente de IA |
| `integration.create` | Criar integração entre sistemas |
| `documentation.create` | Criar documentação técnica |
| `architecture.design` | Desenhar arquitetura |
| `process.design` | Criar processo operacional |
| `api.design` | Desenhar contrato de API |

### Analisar

| ID | Missão |
|---|---|
| `project.analyze` | Analisar projeto ou código existente |
| `architecture.review` | Revisar arquitetura |
| `security.audit` | Auditar segurança |
| `performance.analyze` | Analisar desempenho |
| `data.analyze` | Analisar dados ou documento |
| `requirements.analyze` | Analisar e refinar requisitos |
| `dependencies.analyze` | Analisar dependências |
| `process.analyze` | Analisar processo operacional |

### Corrigir

| ID | Missão |
|---|---|
| `error.diagnose` | Diagnosticar e corrigir erro ou bug |
| `build.fix` | Corrigir falha de build ou deploy |
| `security.fix` | Corrigir vulnerabilidade |
| `performance.fix` | Corrigir problema de performance |
| `integration.fix` | Corrigir falha de integração |

### Evoluir

| ID | Missão |
|---|---|
| `system.modernize` | Modernizar sistema legado |
| `tech.migrate` | Migrar tecnologia ou linguagem |
| `code.refactor` | Refatorar código |
| `system.scale` | Planejar escalabilidade |
| `feature.add` | Adicionar funcionalidade a sistema existente |

### Planejar

| ID | Missão |
|---|---|
| `product.plan` | Planejar produto ou MVP |
| `project.plan` | Planejar projeto e roadmap |
| `sprint.plan` | Planejar sprint |
| `infrastructure.plan` | Planejar infraestrutura |
| `deploy.plan` | Planejar estratégia de deploy |

### Pesquisar e decidir

| ID | Missão |
|---|---|
| `tech.research` | Pesquisar tecnologia |
| `solutions.compare` | Comparar ferramentas ou abordagens |
| `poc.create` | Criar prova de conceito |
| `feasibility.study` | Realizar estudo de viabilidade |
| `impact.assess` | Avaliar impacto de uma mudança |

## Mission Genome

O Genome será a fonte declarativa de comportamento de cada missão. A lógica específica não deverá ficar espalhada por componentes de interface.

```typescript
interface MissionGenome {
  id: string
  category: MissionCategory
  title: string
  description: string
  icon: string
  steps: MissionStepDefinition[]
  conditionalSteps: ConditionalStep[]
  specialists: SpecialistRole[]
  validations: ValidationRule[]
  artifacts: ArtifactDefinition[]
  inputTypes: InputType[]
  executionModes: ExecutionMode[]
  gapDetector: GapDetectorConfig
  riskRules: RiskRule[]
  estimatedTime: string
  complexity: number
}
```

## Jornada adaptativa

O engine deverá montar e atualizar a jornada considerando:

- respostas anteriores;
- tipo de sistema;
- integrações selecionadas;
- dados sensíveis identificados;
- capacidades adicionadas;
- nível de experiência do usuário.

### Regras adaptativas previstas

- Automação sem integração externa remove a etapa de credenciais externas.
- Pagamentos adicionam antifraude, idempotência e conciliação.
- Dados sensíveis inserem uma etapa de LGPD antes da conclusão.
- Para iniciantes, etapas complexas são divididas em partes menores.
- Para especialistas, etapas simples são agrupadas em uma tela compacta.

## Jornadas prioritárias

### `software.build`

1. Visão do produto
2. Usuários e permissões
3. Requisitos funcionais
4. Regras de negócio
5. Linguagem e ecossistema
6. Arquitetura
7. Modelo de dados
8. APIs e contratos
9. Segurança
10. Interface e UX
11. Testes e qualidade
12. Infraestrutura
13. Observabilidade
14. Deploy
15. Documentação
16. Blueprint final

### `automation.create`

1. Processo atual
2. Objetivo da automação
3. Gatilho
4. Entradas e dados
5. Regras e condições
6. Ações
7. Ramificações
8. Integrações e credenciais
9. Tratamento de erros e retentativas
10. Idempotência
11. Logs e auditoria
12. Aprovação humana, quando necessária
13. Publicação e monitoramento

### `error.diagnose`

1. Erro observado
2. Comportamento esperado
3. Reprodução do problema
4. Logs e stack trace
5. Ambiente e contexto
6. Hipóteses
7. Diagnóstico pela IA
8. Correção proposta
9. Validação
10. Prevenção de regressão

### `project.analyze`

1. Escopo e objetivo da análise
2. Material de entrada
3. Análise por dimensão
4. Descobertas e evidências
5. Severidade e priorização
6. Recomendações
7. Plano de ação
8. Relatório final

### `system.modernize`

1. Estado atual do sistema
2. Tecnologias existentes
3. Problemas e motivação
4. Dependências e riscos
5. Arquitetura alvo
6. Estratégia de migração
7. Fases e rollback
8. Validação por fase
9. Plano final

### `project.plan`

1. Objetivo e visão
2. Escopo e MVP
3. Usuários e stakeholders
4. Funcionalidades e épicos
5. Priorização
6. Dependências
7. Fases e milestones
8. Riscos
9. Roadmap

## AI Council

Cada tipo de missão ativará especialistas compatíveis com o contexto.

| Especialista | Missões principais |
|---|---|
| Software Architect | `software.build`, `architecture.design`, `architecture.review` |
| Backend Engineer | `software.build`, `api.design`, `integration.create` |
| Frontend Engineer | `software.build` |
| Database Engineer | `software.build`, `data.analyze` |
| Security Engineer | `software.build`, `security.audit`, `security.fix` |
| QA Engineer | `software.build`, `error.diagnose` |
| DevOps Engineer | `software.build`, `deploy.plan`, `infrastructure.plan` |
| Automation Architect | `automation.create`, `automation.analyze` |
| Integration Specialist | `integration.create`, `integration.fix` |
| Risk Analyst | `project.plan`, `impact.assess`, `feasibility.study` |
| Technical Writer | `documentation.create`, `requirements.analyze` |
| Performance Analyst | `performance.analyze`, `performance.fix` |
| Security Auditor | `security.audit` |
| Product Strategist | `product.plan`, `project.plan` |

Cada especialista deverá definir perguntas, campos analisados, riscos detectados, ações sugeridas e critérios de validação.

## Modos de execução

| Modo | Comportamento esperado |
|---|---|
| Guiado | Explica cada etapa e conduz passo a passo. |
| Rápido | Produz uma primeira versão completa para refinamento. |
| Especialista | Expõe configurações, decisões e trade-offs em formato compacto. |
| Análise | Examina o material fornecido e gera diagnóstico estruturado. |
| Colaborativo | Usuário e IA alternam a iniciativa. |
| Autônomo | Executa dentro de limites previamente aprovados. |
| Aprendizado | Explica decisões, termos e exemplos. |

> [!warning] Regra de segurança
> Nenhuma ação irreversível poderá ocorrer em modo autônomo sem confirmação explícita.

## Context Engine

O Context Engine deverá manter entradas, decisões, rejeições, respostas, lacunas, riscos, inconsistências, histórico e memória compartilhada entre missões relacionadas.

Quando uma decisão anterior for alterada, o sistema deverá:

1. identificar etapas dependentes;
2. apresentar o impacto;
3. solicitar decisão sobre propagação;
4. registrar a mudança e sua justificativa.

## Inteligência contínua

### Detector de lacunas

Analisa continuamente o contexto e aponta situações ainda não cobertas. O usuário poderá adicionar todas, revisar individualmente, ignorar com justificativa ou enviar para o backlog.

Exemplos:

- automação sem cancelamento, timeout, idempotência ou notificação de erro;
- marketplace sem comissões, devoluções, moderação, disputas ou conciliação.

### Detector de inconsistências

| Situação | Resposta planejada |
|---|---|
| Banco relacional com estrutura altamente não relacional | Alertar e sugerir alternativa ou modelo híbrido. |
| Microserviços em projeto pequeno e com prazo curto | Recomendar monólito modular. |
| Dados sensíveis sem criptografia | Bloquear avanço até a definição. |
| Endpoint privado sem autenticação | Alertar e sugerir correção. |
| Framework incompatível com a linguagem | Bloquear e apresentar opções compatíveis. |
| Tempo real sem WebSocket ou mensageria | Indicar lacuna técnica. |
| Automação sem tratamento de erro | Marcar como risco crítico. |
| Loop infinito potencial | Bloquear publicação. |

## Assistência contextual por campo

Campos relevantes poderão oferecer ações específicas de IA, como:

- gerar ou completar conteúdo;
- localizar ambiguidades;
- criar critérios de aceitação e casos de teste;
- relacionar regras com módulos e entidades;
- gerar modelos, diagramas e payloads;
- identificar dados sensíveis e riscos;
- analisar logs e stack traces;
- sugerir correções e testes de regressão.

Toda sugestão deverá apresentar estado atual, proposta, justificativa, impacto e opções para aceitar, rejeitar ou modificar.

## Artifact Factory

| Missão | Entregáveis planejados |
|---|---|
| `software.build` | Blueprint, Prompt.md, arquitetura, módulos, dados, APIs, testes, deploy e documentação |
| `automation.create` | Workflow JSON/YAML, contratos, credenciais, falhas, testes e pacote instalável |
| `project.analyze` | Relatório executivo, evidências, riscos e plano de ação |
| `error.diagnose` | Diagnóstico, causa raiz, patch, validação e prevenção |
| `system.modernize` | Inventário, dependências, arquitetura alvo, migração e rollback |
| `project.plan` | Roadmap, backlog, épicos, dependências, estimativas e riscos |
| `solutions.compare` | Comparativo, critérios e recomendação contextualizada |
| `documentation.create` | Documento, estrutura, cobertura, pendências e referências |

Artefatos poderão alimentar novas missões. Exemplo: um blueprint de `software.build` poderá iniciar uma missão `project.plan`.

## Entradas de contexto

- texto livre;
- arquivos;
- repositórios GitHub ou GitLab;
- URLs;
- schema, dump ou consulta de banco de dados;
- imagens, screenshots e diagramas;
- respostas de API e contratos OpenAPI;
- projetos ou missões anteriores.

A IA deverá analisar as fontes antes de recomendar decisões e indicar explicitamente quais fontes sustentam cada conclusão.

## Experiência de interface planejada

```text
┌──────────────┬────────────────────────────┬────────────────────┐
│ Jornada      │ Etapa atual                │ Contexto e saída   │
│              │                            │                    │
│ Etapas       │ Formulário dinâmico        │ Prévia             │
│ Alertas      │ Ações de IA por campo      │ Copiloto           │
│ Riscos       │ Validações em tempo real   │ Conhecimento       │
└──────────────┴────────────────────────────┴────────────────────┘
```

Em telas menores, as colunas laterais deverão virar drawers. Cada painel poderá ser recolhido individualmente.

### Central de conhecimento

O painel lateral deverá adaptar conteúdo à stack, à etapa e ao problema atual, apresentando referências, checklists, padrões, riscos e comandos de diagnóstico relevantes.

### Comparador de tecnologias

O comparador deverá considerar curva de aprendizado, produtividade, desempenho, maturidade, custo operacional, manutenção, escalabilidade, compatibilidade com a stack e adequação ao prazo.

A recomendação será contextualizada ao projeto, e não uma comparação genérica.

## Módulos técnicos planejados

```text
MissionShell
├── MissionRegistry
├── MissionEngine
├── MissionContext
├── MissionAutosave
├── MissionValidation
├── MissionGapDetector
└── MissionImpactAnalyzer

AICouncil
├── FieldAssistant
├── CopilotPanel
└── KnowledgeCenter

ArtifactFactory
├── BlueprintPreview
├── TechnologyCatalog
└── TechnologyComparator

Advisors
├── DiagnosticAssistant
├── ArchitectureAdvisor
├── SecurityAdvisor
├── DataModelDesigner
└── ApiContractDesigner

Memory
├── DecisionHistory
└── MissionMemory
```

O bundle inicial deverá carregar somente Shell, Registry e Engine. Módulos adicionais serão carregados sob demanda.

## Modelo de dados de referência

```typescript
interface MissionInstance {
  id: string
  type: string
  userId: string
  workspaceId: string
  projectId: string | null
  status: 'active' | 'paused' | 'completed' | 'abandoned'
  mode: ExecutionMode
  context: MissionContext
  journey: JourneyState
  artifacts: MissionArtifact[]
  createdAt: Date
  updatedAt: Date
  version: number
}

interface Decision {
  stepId: string
  fieldId: string
  value: unknown
  source: 'user' | 'ai_accepted' | 'ai_modified'
  reason: string | null
  timestamp: Date
  impacts: ImpactedStep[]
}

interface MissionArtifact {
  type: string
  content: unknown
  format: 'json' | 'markdown' | 'yaml' | 'text'
  generatedAt: Date
  canFeedMission: string[]
}

interface Risk {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: string
  title: string
  description: string
  affectedSteps: string[]
  suggestedAction: string
  autoDetected: boolean
  dismissed: boolean
}
```

## Regras de IA

- Usar exclusivamente a chave configurada pelo usuário.
- Nunca utilizar chave global da plataforma.
- Validar provider, chave e modelo antes de cada chamada.
- Informar falhas de autenticação claramente.
- Não inventar informações quando faltar contexto.
- Perguntar ou registrar o item como pendente.
- Nunca executar alterações silenciosamente.
- Mostrar proposta, justificativa, impacto e opções de decisão.

## Plano de implementação futuro

### Fase 1 — Base universal (MVP)

- [ ] Seletor de tipo de missão.
- [ ] Mission Registry com oito tipos iniciais.
- [ ] Jornada com etapas condicionais.
- [ ] Context Engine com memória de decisões.
- [ ] Autosave contínuo.
- [ ] Copiloto contextual.
- [ ] Prévia adaptada ao tipo de missão.
- [ ] Detector básico de lacunas.

Missões do MVP:

- `software.build`
- `project.analyze`
- `automation.create`
- `error.diagnose`
- `system.modernize`
- `project.plan`
- `architecture.review`
- `documentation.create`

### Fase 2 — Inteligência por domínio

- [ ] AI Council com especialistas por missão.
- [ ] Detector de inconsistências por tipo.
- [ ] Assistência contextual por campo.
- [ ] Central de conhecimento adaptável.
- [ ] Comparador de tecnologias.
- [ ] Modelo de dados visual.
- [ ] Designer de APIs e contratos.

### Fase 3 — Entregáveis e execução

- [ ] Artifact Factory completo.
- [ ] Mapa visual de dependências.
- [ ] Análise de impacto entre etapas.
- [ ] Diagnóstico com contexto da stack.
- [ ] Infraestrutura e deploy guiados.
- [ ] Memória entre missões do mesmo projeto.

### Fase 4 — Escala e autonomia

- [ ] Modo Aprendizado completo.
- [ ] Modo Autônomo com aprovação por etapa.
- [ ] Templates reutilizáveis.
- [ ] Histórico avançado e versionamento.
- [ ] Novos tipos de missão via plugin.
- [ ] Analytics de uso por tipo de missão.

## Critério de sucesso

O Mission Workspace será considerado bem-sucedido quando usuários com diferentes níveis de experiência conseguirem transformar um problema técnico ou operacional em um entregável utilizável, com uma jornada adaptada, especialistas adequados e acompanhamento até a conclusão.

## Dependências documentais relacionadas

- [[Sistema de missões]]
- [[Arquitetura do contexto]]
- [[Sistema de memória]]
- [[Engine de IA]]
- [[Sistema de Governança de IA]]
- [[Plataforma de Conhecimento]]
- [[Catálogo de Tecnologias]]
- [[Mapa do Frontend Premium]]

## Pendências de decisão

- [ ] Definir se o Mission Workspace substitui ou complementa o conceito atual de missões de onboarding.
- [ ] Definir contratos formais do Genome e da jornada adaptativa.
- [ ] Definir estratégia de persistência e versionamento.
- [ ] Definir limites operacionais do modo autônomo.
- [ ] Definir política de relacionamento entre artefatos e novas missões.
- [ ] Definir métricas de sucesso do MVP.

---

*LDCN OS · Mission Workspace · Documento de planejamento · v1.0*
