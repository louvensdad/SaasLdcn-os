# Validação do Portão da Meta-Fábrica

## Regra do portão

A Meta-Fábrica só recebe um projeto em `ENGINEERING_APPROVED` com **todos** os checks
obrigatórios passados. Implementado em
`apps/api/app/services/project_room_service.py::send_to_generator`:

```python
checks = self._readiness_checks(room)
failed = [c for c in checks if c["required"] and c["status"] != "passed"]
if room["status"] != "ENGINEERING_APPROVED" or failed:
    self._fail(... expected=["ENGINEERING_APPROVED"], checks=checks)
```

## Checklist Enterprise (real, não inventado)

`_readiness_checks()` produz, a partir de spec + blueprint:
PromptMaster · Blueprint · Review · Consistência (mesmo `project_id`) ·
Dependências (integrations+apis) · Segurança (auth+authorization) · Contrato ·
Documentação (versões) · Build (deploy) · Testes (tests) · Stack.

A UI renderiza esse checklist verbatim (`EnterpriseChecklist`) e, no veredito,
lista exatamente os itens que faltam — sem mensagem genérica.

## Cenários de bloqueio verificados (pytest)

- `test_send_to_generator_before_review_returns_diagnostic`: em `BLUEPRINT_READY`,
  `409` com `status_current=BLUEPRINT_READY`, `status_expected=[ENGINEERING_APPROVED]`,
  e o check `engineering_review` marcado como `failed`. Operational log registra `rollback`.
- `test_approve_requires_prompt_ready`: aprovar fora de hora → `409`.
- `test_approve_blocks_degraded_blueprint_until_acknowledged`: blueprint determinístico
  não pode ser aprovado sem o reconhecimento consciente.
- `test_approve_then_send_to_generator`: após aprovação real, `send` → `WAITING_META_FACTORY`,
  handoff `queued`, todos os checks `passed`, history registra "Enviado Meta-Fabrica".

## Conclusão

O portão bloqueia corretamente estados inválidos e libera apenas o estado correto.
Nenhum caminho de UI consegue burlar a validação — o backend é a autoridade final.
