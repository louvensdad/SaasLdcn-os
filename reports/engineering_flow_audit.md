# Engineering Flow Audit — Project Room → Architect → Engineering Review → Meta-Fábrica

Data: 2026-06-26 · Branch: `feat/premium-foundation`

## Veredito

O backend já era a fonte da verdade e estava maduro. **A contradição reportada
era um bug de orquestração no frontend**, não uma falha do state machine.

## Causa raiz (confirmada no código)

`apps/web/app/(app)/engineering-review/page.tsx`, função `approve()` original:

```ts
await projectRoomsClient.sendToGenerator(room.room_id); // único passo
```

- A sala chega na página em `ENGINEERING_REVIEW`.
- `POST /send-to-generator` (backend) **exige** `ENGINEERING_APPROVED`
  (`apps/api/app/services/project_room_service.py::send_to_generator`).
- A transição intermediária `approve` (`ENGINEERING_REVIEW → ENGINEERING_APPROVED`)
  **nunca era chamada**.
- Resultado: a tela mostrava o veredito positivo enquanto o clique retornava `409`
  com "A Meta-Fabrica exige Blueprint revisado e Engineering Review aprovado."

Agravante: a página **definia** `WorkflowProgress`, `OperationalLog`,
`FailureDiagnostic` e `EnterpriseChecklist` (e os estados `steps`/`logs`/`diagnostic`)
mas **nunca os renderizava** — a camada de feedback foi esboçada e deixada órfã.

## O que já estava correto no backend (reaproveitado, não reescrito)

- Status oficiais completos (`DRAFT … READY/FAILED`) em `schemas/project_room.py`.
- `readiness_checklist`, `workflow` (`primary_action`, `can_send_to_meta_factory`,
  `blocking_reasons`, `expected_next_statuses`), `history`, `operational_log`,
  `last_failure` (diagnóstico estruturado) — todos já decorados no objeto da sala.
- Diagnóstico estruturado em `_fail()` com `status_current/expected/endpoint/...`.

## Correções aplicadas

1. **Orquestração multi-etapa** no `approveAndSend()`: validar PromptMaster → validar
   Blueprint → validar Review → (abrir review se preciso) → (confirmar preview se
   degradado) → aprovar → enviar → redirecionar, com cada etapa em
   pending/running/success/failed.
2. **Render** de `WorkflowProgress`, `EnterpriseChecklist`, `OperationalLog`,
   `FailureDiagnostic` + novos `CommitteePanel`, `ReviewScorePanel`, `DeterministicGate`.
3. **Botões inteligentes** dirigidos por status (nunca uma ação impossível).
4. **Modo determinístico** tratado como degradado, com CTAs e confirmação textual.
5. Backend: decisões mais profundas, Engineering Review Engine + Review Score,
   endpoint `acknowledge-preview` auditável.

## Validação

- `pytest` (suite completa): **348 passed, 1 skipped** (sem regressão).
- `tsc --noEmit`: limpo.
- `npm run build`: `/architect` e `/engineering-review` compilam.
- Playwright `engineering-review.spec.ts`: **7 passed**.
