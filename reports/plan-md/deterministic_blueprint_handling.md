# Tratamento do Blueprint Determinístico (modo degradado)

## Princípio

Sem um LLM real, o Architect produz um **preview determinístico**. Ele é honesto e
útil como prévia técnica, mas **não é o melhor resultado possível** — e agora é
tratado como modo degradado, não como suficiente.

Origem: `apps/api/app/engines/architect_engine.py::_deterministic_blueprint`
(`degraded=True`, `mode="PREVIEW_DETERMINISTIC"`, `confidence=0.64`).

## UI — painel degradado (`DeterministicGate`)

Em `engineering-review/page.tsx`, quando `blueprint.degraded && !preview_acknowledged`:

- Aviso forte: "Preview determinístico (modo degradado)".
- Provider ativo: "Nenhum (determinístico)"; Modo/LLM: "PREVIEW_DETERMINISTIC — sem LLM".
- CTAs: **Conectar GPT / Claude / Gemini / DeepSeek** (→ `/settings`) e
  **Regenerar com IA** (→ `/architect`, onde a regeneração com chave já existe).
- Para continuar mesmo assim, é obrigatório digitar exatamente
  **`CONTINUAR COM PREVIEW`** — espelhando o padrão `LIBERAR COM RISCO` da Meta-Fábrica.

## Gating + auditoria (backend)

- `POST /project-rooms/{id}/acknowledge-preview` valida a frase exata
  (`CONSCIOUS_PREVIEW_PHRASE`), seta `preview_acknowledged=True` no blueprint e
  registra **history** ("Continuacao em modo deterministico") + **operational_log**.
- `approve` (ENGINEERING_REVIEW → ENGINEERING_APPROVED) é **bloqueado** quando o
  blueprint é degradado e não foi reconhecido — `409` orientando regenerar com IA
  ou confirmar o preview.
- Regenerar o Blueprint cria um objeto novo (`preview_acknowledged=False`), exigindo
  novo reconhecimento — a decisão nunca "vaza" entre versões.

## Comitê de Engenharia sobre o preview

O `engineering_review_engine` marca explicitamente o blueprint determinístico como
decisão **discutível** e como **risco** ("Arquitetura não revisada por IA"), e
recomenda conectar IA e regenerar — sem fingir que o preview é definitivo.

## Verificado

- Backend: `test_approve_blocks_degraded_blueprint_until_acknowledged`,
  `test_acknowledge_preview_requires_exact_phrase`.
- Frontend: `deterministic blueprint is a degraded preview gated by a typed confirmation`
  (botão desabilitado até a frase exata; CTAs presentes).
