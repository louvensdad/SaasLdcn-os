# Blueprint Schema

## Formato canônico

```yaml
schema_version: 1.0.0
blueprint_version: 1.0.0
status: draft
source_prompt_id: prompt_123
project_type: web_application
modules: []
screens: []
entities: []
apis: []
permissions: []
integrations: []
automations: []
technology:
  frontend: null
  backend: null
  database: null
infrastructure:
  environments: []
  resources: {}
tests: []
acceptance_criteria: []
dependencies: []
risks: []
decisions: []
approval:
  approved_by: null
  approved_at: null
```

## Regras

Cada item deve possuir `id`, `name`, `description`, `source_refs`, `status` e `dependencies` quando aplicável. Tecnologias são propostas até aprovação.

## Critérios de aceitação

- [ ] Blueprint aprovado possui Prompt.md de origem.
- [ ] Módulos, telas, entidades e APIs possuem IDs estáveis.
- [ ] Dependências circulares são detectadas.
- [ ] Campos incompatíveis com o tipo de projeto bloqueiam aprovação.
