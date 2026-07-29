# Feedback de Ações Críticas

## Antes (bug)

"Aprovar e enviar à Meta-Fábrica" chamava só `sendToGenerator()` a partir de
`ENGINEERING_REVIEW`. O backend exige `ENGINEERING_APPROVED` → `409` garantido,
sem feedback de etapas, enquanto a tela mostrava veredito positivo.

## Depois — feedback completo

Toda ação crítica agora expõe:

- **Loading / etapa atual**: `WorkflowProgress` com pending/running/success/failed
  e barra de progresso por etapa.
- **Sucesso / erro / motivo**: `FailureDiagnostic` mostra, em caso de falha,
  `status_current`, `status_expected`, `endpoint_called`, `http_status`,
  `backend_message`, `rejection_reason` e `correction` (ação recomendada).
- **Endpoint chamado + status**: `ClientLogPanel` (log da sessão) lista cada
  `POST endpoint HTTP_status — mensagem`; abaixo, `OperationalLog` mostra o log
  persistido do backend (inclui `rollback` quando uma transição é rejeitada).
- **Status atual / esperado / ação recomendada**: derivados do diagnóstico
  estruturado do backend, nunca de string genérica.

## Erros explícitos (exemplo real)

`POST /send-to-generator` em `BLUEPRINT_READY` retorna:

```json
{
  "status_current": "BLUEPRINT_READY",
  "status_expected": ["ENGINEERING_APPROVED"],
  "endpoint_called": ".../send-to-generator",
  "http_status": 409,
  "backend_message": "A Meta-Fabrica exige Blueprint revisado e Engineering Review aprovado.",
  "rejection_reason": "...checks que falharam...",
  "correction": "Corrija os itens com falha no checklist e aprove a Engineering Review."
}
```

A UI renderiza esse objeto literalmente — causa real + como corrigir.

## Botões inteligentes (nunca uma ação impossível)

- Sem PromptMaster aprovado → "Voltar à Sala de Projeto".
- PromptMaster aprovado, sem Blueprint → "Abrir Architect Engine" / "Gerar Blueprint".
- Blueprint pronto / em review → botão único "Aprovar e enviar à Meta-Fábrica"
  (orquestra abrir review → confirmar preview → aprovar → enviar).
- Já aprovado → "Enviar para Meta-Fábrica".
- Já enviado (terminais meta) → link "Abrir Meta-Fábrica" (sem botão de aprovar).

## Verificado (Playwright)

- `a 409 on send shows the explicit diagnostic (current vs expected status)`.
- `smart buttons: already-sent room offers Meta-Factory, not approve`.
- `committee and review score render from real backend fields`.
