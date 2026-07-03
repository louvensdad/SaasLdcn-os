# Vistas de Arquitetura — Determinísticas e Honestas

## Princípio

As vistas são **derivadas de regras** a partir do spec + blueprint reais
(`architecture_model_engine.py`, `deterministic=true`). Onde não há evidência, a vista
volta vazia / `available:false` e a UI mostra "sem evidências suficientes" — nunca um
diagrama fabricado. Escopo confirmado: estruturadas (sem C4 gráfico de 4 níveis).

## Vistas entregues

| Vista | Como é derivada | Honestidade |
|---|---|---|
| Context Diagram | Atores→camadas→stores; +externos/observabilidade conforme áreas | Núcleo sempre presente |
| Bounded Contexts | Identity/Billing/Notification/Files/Core de entidades+áreas | **Billing só com entidade de pagamento real** |
| Data Flow | Usuário→Frontend→API→Service→Repository→Banco (+Logs se observ.) | Passos por área decidida |
| Auth Flow | Login→JWT→Refresh→RBAC→Permissões→Auditoria | Vazio se sem auth |
| Dependências | De `decision.dependencies` reais | Vazio se não declaradas |
| Eventos | Webhooks só com integrações/pagamento | `available:false` caso contrário |
| Cache | Redis opcional só com NFR de performance ou muitas entidades | `available:false` na v1 simples |
| Deploy | Da decisão de deploy do blueprint | `available:false` se não decidido |
| Disaster Recovery | Backup/Restore/RTO/RPO/Replicação (qualitativo) | `available:false` sem banco |

## Componentes de UI

`components/architecture-review/architecture-model-views.tsx`:
`ContextDiagramView`, `BoundedContextsView`, `FlowView`, `DependenciesView`,
`StrategyView`, `DisasterRecoveryView`, e os wrappers `ArchitectureModelTab` /
`ArchitectureStrategiesTab`. Reusados pela página do Architect (abas Modelo/Estratégias).

## Testes

`test_architecture_model.py`: modelo é `None` sem blueprint; Billing só com pagamento;
dependências/estratégias ancoradas em dados reais. Playwright `architect-premium.spec.ts`:
Context Diagram, Bounded Contexts (Identity & Access), Deploy + DR, cache "Indisponível".
