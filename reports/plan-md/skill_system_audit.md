# Skill System Audit

Date: 2026-06-02

## Status Geral

**Classificação: PARTIAL**

LDCN OS ainda não possui um Skill System real. Existem conceitos parecidos espalhados em Engineering Readiness, Architectural Graph ownership, capabilities, templates, framework specialists e LDCN Presence, mas não existe uma camada própria de skills com contrato, registry, endpoints, selector, frontend operacional, marketplace ou execution plan.

## Critério Aplicado

- **EXISTING_REAL**: contrato de skill, registry, endpoint backend, consumo frontend e testes específicos.
- **PARTIAL**: documentação, placeholders, conceitos parecidos ou nomes soltos.
- **NOT_IMPLEMENTED**: nenhuma camada real nem conceitos próximos.

O estado encontrado é **PARTIAL** porque há `SkillRequirement` e `required_skills` como metadata de readiness/expertise, além de ações reservadas no LDCN Presence, mas nada disso constitui Skill System operacional.

## Arquivos Encontrados

### Skill-Like Contracts

- `packages/contracts/engineering-readiness.contract.ts`
  - Define `SkillRequirement`.
  - Usa `SkillRequirement` em `TeamRole.required_skills`, `TeamRole.optional_skills` e `TeamRecommendation.required_expertise`.
  - Escopo real: requisitos humanos de expertise/readiness.

- `packages/contracts/architectural-graph.contract.ts`
  - Define `required_skills` como strings em `NodeOwnership` e `ArchitecturalNode`.
  - Escopo real: metadata de ownership de nós arquiteturais.

### Skill-Like Schemas

- `apps/api/app/schemas/engineering_readiness.py`
  - Define `class SkillRequirement(ApiModel)`.
  - Usa esse schema em `TeamRole` e `TeamRecommendation`.
  - Escopo real: resposta de Engineering Readiness.

- `apps/api/app/schemas/architectural_graph.py`
  - Define `required_skills` como lista de strings em ownership/nodes.
  - Escopo real: descrição de skills humanas exigidas por componente arquitetural.

### Skill-Like Backend Logic

- `apps/api/app/engines/engineering_readiness_engine.py`
  - Usa helper `_skill(...)` para montar objetos estáticos como:
    - `application_design`
    - `api_contracts`
    - `devops_baseline`
    - `ai_infra`
    - `vector_data`
    - `security_baseline`
  - Escopo real: recomendações de equipe e maturidade técnica.
  - Não há registry, seleção de skill, execução, lifecycle, marketplace ou plano operacional.

- `apps/api/app/engines/architectural_graph_engine.py`
  - Gera `required_skills` em `calculate_node_ownership`.
  - Exemplos: `release automation`, `incident response`, `service ownership`, `provider contracts`.
  - Escopo real: ownership/risk/readiness de nós no grafo.

### Routes e Frontend Consumption Relacionados

- `apps/api/app/routes/engineering_readiness.py`
  - Endpoints de readiness/team/delivery.
  - Não são endpoints de skills.

- `apps/web/hooks/use-engineering-readiness.ts`
- `apps/web/hooks/use-team-profile.ts`
- `apps/web/components/wizard/engineering-readiness-panel.tsx`
- `apps/web/components/architectural-graph/graph-node-details.tsx`
  - Renderizam expertise/required skills como badges.
  - Não existe skill selector, skill detail, skill execution UI ou skill marketplace.

### LDCN Presence / Future Actions

- `apps/web/components/ldcn/ldcn-command-surface.tsx`
  - Lista ações como:
    - `explain_current_page`
    - `review_blueprint`
    - `inspect_gatekeeper`
    - `prepare_generation`
    - `suggest_next_step`
  - Todas aparecem como **Reserved future actions**.
  - Os botões estão disabled e descritos como sem execução/mutação.
  - Escopo real: placeholder visual de presença, não Skill System.

## O Que Existe

- Metadata de expertise humana para Engineering Readiness.
- Metadata de required skills para ownership do Architectural Graph.
- Renderização frontend dessas informações como badges.
- Ações futuras reservadas no LDCN Presence.
- Capabilities técnicas selecionáveis no Wizard/Blueprint.
- Templates com registry, metadata, compatibility e recommendations.
- Framework Specialist profiles com capacidades recomendadas e readiness.

## O Que Não Existe

Não foi encontrado:

- `SkillRegistry`
- `SkillDefinition`
- `skill.contract`
- contrato `Skill`
- skill engine
- skill service
- skill routes
- skill selector
- skill execution plan
- skill marketplace
- `ldcn skills`
- endpoint `/skills`
- hook `useSkills`
- componente de seleção/execução de skills
- teste backend ou frontend específico para Skill System
- arquivos nomeados `skill` ou `skills` nos diretórios auditados

## Diretórios Auditados

- `packages/contracts`
- `apps/api/app/engines`
- `apps/api/app/services`
- `apps/api/app/routes`
- `apps/api/app/schemas`
- `apps/web/components`
- `apps/web/hooks`
- `docs`
- `future`

## Diferença Entre Capability, Template e Skill

### Capability

Capability é um recurso técnico selecionável no blueprint.

Exemplos existentes:

- authentication
- payments
- observability
- rag
- analytics

No projeto, capabilities são usadas para validar arquitetura, endpoints, infraestrutura e Gatekeeper. Elas descrevem o que o projeto precisa suportar, não uma ação operacional executável pelo LDCN.

### Template

Template é uma base gerável ou reutilizável.

Exemplos existentes:

- `landing-page`
- `portfolio`
- `docs-site`
- `static-site`

No projeto, templates possuem registry, metadata, compatibility, recommendation e geração local. Eles descrevem uma base de projeto, não uma skill operacional.

### Skill

Skill deveria ser uma ação/capacidade operacional que o LDCN ou o sistema pode executar, ensinar, planejar ou preparar.

Exemplos futuros citados no objetivo:

- `create_static_site`
- `create_landing_page`
- `review_blueprint`
- `inspect_gatekeeper`
- `prepare_generation`
- `explain_architecture`
- `generate_endpoints_plan`
- `review_security_baseline`
- `prepare_download`
- `diagnose_backend_offline`
- `suggest_framework`
- `estimate_team_readiness`

Hoje esses itens não existem como domínio próprio. Alguns nomes aparecem como ações reservadas de LDCN Presence, mas sem contrato, endpoint, executor ou estado operacional.

## Riscos de Confundir Skill com Capability/Template

- Tratar `SkillRequirement` como Skill System pode criar falsa sensação de execução operacional. Hoje ele só indica expertise humana necessária.
- Confundir capability com skill pode misturar requisitos do projeto com ações do LDCN. Capability é requisito técnico; skill seria uma ação ou procedimento operacional.
- Confundir template com skill pode duplicar responsabilidades. Template é base gerável; skill poderia selecionar, revisar, aplicar ou explicar um template.
- Reusar ações reservadas do LDCN Presence como se fossem skills pode quebrar a expectativa de segurança, pois elas estão explicitamente marcadas como futuras e sem execução.
- Implementar skills em cima de badges/readiness sem contrato próprio dificultaria testes, autorização, auditoria e rastreabilidade.

## Recomendação de Próxima Fase

Criar uma fase separada de **Skill System Foundation**, sem execução real inicialmente, contendo:

- `packages/contracts/skill.contract.ts`
- schemas backend de `SkillDefinition`, `SkillRegistryItem`, `SkillCompatibility`, `SkillExecutionPlan`
- engine de registry local e determinístico
- endpoints read-only:
  - `GET /api/skills/catalog`
  - `GET /api/skills/{skill_id}`
  - `GET /api/skills/{skill_id}/compatibility`
  - `GET /api/skills/recommended`
- frontend read-only:
  - Skill catalog
  - skill detail
  - recommended skills no Wizard/Project Detail
  - nenhum executor inicialmente
- testes para garantir que skills não executam código, shell, agentes, IA ou mutações fora de escopo

Somente depois dessa fundação read-only deveria existir uma fase de execution plan, ainda sem execução automática, para modelar passos seguros como `review_blueprint`, `inspect_gatekeeper`, `prepare_download` e `diagnose_backend_offline`.

## Conclusão

O Skill System real **não está implementado**. O estado correto é **PARTIAL**: existem conceitos próximos e nomes soltos, principalmente em readiness/expertise e LDCN Presence, mas falta a camada de domínio necessária para chamar isso de Skill System.
