# Prompt.md Schema

## Formato canônico

```yaml
schema_version: 1.0.0
prompt_version: 1.0.0
project_type: web_application
status: draft
author_id: usr_123
workspace_id: ws_123
project_id: null
original_intent:
  text: "Quero um sistema para organizar minhas dívidas"
  captured_at: "2026-07-19T00:00:00Z"
summary: ""
problem: ""
audience: []
objectives: []
requirements:
  confirmed: []
  inferred: []
  suggested: []
  rejected: []
scope:
  included: []
  excluded: []
flows: []
business_rules: []
data_entities: []
integrations: []
automation: null
non_functional: []
visual_preferences: []
technical_preferences: []
constraints: []
acceptance_criteria: []
assumptions: []
pending_questions: []
risks: []
delivery_strategy:
  mvp: []
  beta: []
  future: []
approval:
  approved_by: null
  approved_at: null
```

## Validação

`schema_version`, `prompt_version`, `project_type`, `status`, `original_intent`, `requirements`, `acceptance_criteria`, `assumptions` e `approval` são obrigatórios.

## Regras

Enums controlados, IDs estáveis, campos desconhecidos rejeitados em modo estrito e compatibilidade evolutiva por versão.

## Critérios de aceitação

- [ ] Draft pode ter aprovação vazia.
- [ ] Approved exige usuário e timestamp.
- [ ] Inferred nunca é tratado como Confirmed.
- [ ] O schema é validável automaticamente.
