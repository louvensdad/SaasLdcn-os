# State Machine da Engineering Review

## Estados e transições relevantes

```
BLUEPRINT_READY ──engineering-review──▶ ENGINEERING_REVIEW
ENGINEERING_REVIEW ──(degradado) acknowledge-preview──▶ (preview_acknowledged=True)
ENGINEERING_REVIEW ──approve──▶ ENGINEERING_APPROVED
ENGINEERING_APPROVED ──send-to-generator──▶ WAITING_META_FACTORY
```

Normalização de estados legados (`_normalize_status`):
`APPROVED → ENGINEERING_APPROVED|PROMPT_APPROVED` (conforme há blueprint),
`SENT_TO_GENERATOR → WAITING_META_FACTORY`, `GENERATED → READY`.

## Engenharia da Review ≠ Architect

- O **Architect** decide e justifica (decisões profundas: trade-offs, impacto,
  riscos, quando reconsiderar, dependências, requisitos).
- A **Engineering Review** revisa criticamente (comitê técnico), via
  `apps/api/app/engines/engineering_review_engine.py`, produzindo:
  `good_decisions`, `debatable_decisions`, `risks`, `gaps`, `inconsistencies`,
  `scalability_impact`, `security_impact`, `generation_readiness`, `recommendations`.
- É **determinístico e sempre disponível** (não exige LLM) e **nunca inventa**:
  quando falta evidência, retorna texto "indisponível" e categorias `unavailable`.

## Review Score (somente com critérios reais)

Categorias: Architecture / Security / Scalability / Maintainability / Generation /
Documentation Readiness. Cada uma é `scored` (0–100, com `basis` citando a evidência)
ou `unavailable` (`score=null`). O `overall` é a média apenas das categorias `scored`,
ou `null` se nada for pontuável.

## Workflow de aprovação (UI)

`approveAndSend()` executa as etapas com status pending/running/success/failed:
Validar PromptMaster · Validar Blueprint · Validar Engineering Review ·
[Abrir Review] · [Confirmar preview] · Persistir aprovação · Enviar à Meta-Fábrica ·
Redirecionar. Em falha, a etapa é marcada `failed`, o `FailureDiagnostic` recebe o
diagnóstico do backend e o log da sessão registra o endpoint/HTTP status.

## Histórico

Eventos registrados (`history`): Prompt aprovado, Blueprint criado, Review aprovada,
Continuação em modo determinístico, Enviado Meta-Fábrica, Projeto gerado — cada um
com `source` e `metadata`.
