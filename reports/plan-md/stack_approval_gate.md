# Stack Approval Gate — consentimento explícito de stack/linguagem

Data: 2026-07-03 · Branch: feat/premium-foundation

## Problema

A Meta-Fábrica escolhia linguagem/stack de desenvolvimento sem consentimento
explícito do usuário: a stack vinha do orchestrator/architect (LLM) e a geração
começava direto.

## Solução

### Backend

- **Schema** (`app/schemas/architecture_blueprint.py`): `StackApproval`
  (status PENDING/APPROVED, `approved_by`, `approved_at`, `selected_frontend`,
  `selected_backend`, `selected_database`, `selected_language`, `selected_auth`,
  `selected_testing`, `selected_deploy_target`) + `StackProposal`
  (choice/reason/alternatives por área, derivados das decisões do blueprint).
- **Persistência**: a aprovação vive dentro do blueprint ativo (campo
  `stack_approval`) e da versão ativa em `blueprint_versions` — regenerar o
  blueprint **reseta a aprovação por construção** (a stack pode ter mudado),
  mesmo padrão do `preview_acknowledged`.
- **Endpoint**: `POST /api/project-rooms/{id}/stack/approve`. Corpo vazio =
  aprovar a recomendação como está; campos preenchidos = "Alterar stack"
  (overrides do usuário). Registra history + operational log + mensagem na sala.
- **Enforcement determinístico**: ao aprovar, `selected_language` e
  `selected_backend` sobrescrevem `spec.suggested_stack` (mesmo padrão da
  preferred-language); ao criar o GenerationJob, o servidor reaplica os valores
  aprovados sobre a spec enviada pelo cliente e injeta `stack_approval` no
  blueprint do job — **a geração usa a stack aprovada, nunca a escolha interna
  do modelo**.
- **Gates**:
  - checklist de readiness ganhou o check obrigatório `stack_approval` — o
    `send-to-generator` bloqueia sem aprovação;
  - `POST /api/meta-factory/jobs` (backstop servidor): sala sem
    `stack_approval.status == "APPROVED"` → **409 `STACK_APPROVAL_REQUIRED`**,
    com auditoria `generation_job_blocked_by_stack_gate`.

### Frontend (Engineering Review → aba Readiness)

Painel **Stack Approval Gate** mostra, por área (Frontend, Backend, Banco,
Linguagem, Auth, Testes, Deploy): a escolha, o **motivo** e as **alternativas**
consideradas. Botões:

- **Aprovar stack** (recomendação como está);
- **Alterar stack** (edita cada área e aprova com alterações);
- **Regenerar recomendação com IA** (volta ao Architect com regenerate);
- **Voltar ao Architect**.

Estado aprovado mostra `approved_by` + `approved_at`. i18n nos 4 locales.

## Testes

- `test_meta_factory_blocks_generation_without_stack_approval` (409 + código);
- `test_user_can_alter_stack_before_generation` (overrides persistidos e spec
  atualizada);
- `test_approved_stack_is_persisted` (approved_by/at + check no checklist);
- `test_generation_uses_approved_stack` (job criado com spec "typescript/NestJS"
  no corpo, mas os inputs persistidos do job carregam "go/Gin" aprovados);
- fluxo existente atualizado: `_engineering_approved_room` agora aprova a stack
  (test_project_rooms.py, test_blueprint_governance.py).

## Critério de aprovação

A Meta-Fábrica só inicia com `stackApproval.status == APPROVED`; sem aprovação a
geração é bloqueada com mensagem clara nos dois níveis (workflow e API).
