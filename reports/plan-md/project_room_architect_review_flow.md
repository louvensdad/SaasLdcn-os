# Fluxo Project Room → Architect → Engineering Review → Meta-Fábrica

## Jornada oficial (estados reais do backend)

```
DRAFT → UNDER_REVIEW → PROMPT_READY → PROMPT_APPROVED
      → BLUEPRINT_GENERATING → BLUEPRINT_READY
      → ENGINEERING_REVIEW → ENGINEERING_APPROVED
      → WAITING_META_FACTORY → (META_FACTORY_RUNNING/GENERATING/VALIDATING) → READY
                                                                            ↘ FAILED
```

Fonte única: `apps/api/app/schemas/project_room.py::ProjectRoomStatus` e
`apps/api/app/services/project_room_service.py`. O frontend **não inventa estado**;
ele lê `room.status`, `room.workflow.primary_action` e `room.readiness_checklist`.

## Mapa endpoint → transição

| Endpoint | De | Para |
|---|---|---|
| `POST /project-rooms/{id}/message` | DRAFT | UNDER_REVIEW |
| `POST /{id}/generate-prompt` | UNDER_REVIEW | PROMPT_READY |
| `POST /{id}/approve` | PROMPT_READY | PROMPT_APPROVED |
| `POST /{id}/blueprint` | PROMPT_APPROVED | BLUEPRINT_GENERATING → BLUEPRINT_READY |
| `POST /{id}/engineering-review` | BLUEPRINT_READY | ENGINEERING_REVIEW |
| `POST /{id}/acknowledge-preview` | (degradado) | marca `preview_acknowledged` |
| `POST /{id}/approve` | ENGINEERING_REVIEW | ENGINEERING_APPROVED |
| `POST /{id}/send-to-generator` | ENGINEERING_APPROVED | WAITING_META_FACTORY |
| `POST /{id}/mark-generated` | terminais meta | READY |

Cada transição é validada no backend; pular etapas retorna `409` com diagnóstico
estruturado. Não há caminho que aceite um projeto em estado inválido na Meta-Fábrica.

## Onde a UI lê de cada fonte

- **Architect** (`/architect`): lê `architecture_blueprint` (decisões profundas:
  trade-offs, impacto, riscos, quando reconsiderar, dependências, requisitos).
- **Engineering Review** (`/engineering-review`): lê `engineering_review` (comitê +
  score), `readiness_checklist` (checklist Enterprise), `operational_log`,
  `last_failure`, e orquestra as transições restantes.
- **Meta-Fábrica** (`/meta-factory`): só abre quando o status é terminal-meta; antes
  disso a UI direciona o usuário ao passo que falta.

## Contratos sincronizados

`packages/contracts/project-room.contract.ts` e `architecture-blueprint.contract.ts`
espelham os schemas Pydantic, incluindo os novos campos (`engineering_review`,
`preview_acknowledged`, e os campos profundos da decisão).
