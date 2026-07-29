# Política de Decisão

> **Substituído em 2026-07-20**: esta pasta (`46 - Decisão`) e a pasta `46 - Políticas de Decisão`
> descreviam o mesmo conceito com ordens de precedência diferentes (esta versão omitia
> Constituição e contrato do módulo). Resolvido a favor de
> [[Políticas de Decisão]] (`46 - Políticas de Decisão/Políticas de Decisão.md`), cuja ordem já
> bate com a precedência oficial do vault (Constituição → Domain Model → Language Model →
> Contratos → Schemas → Blueprint → Prompt.md → outros docs). Conteúdo original preservado
> abaixo apenas como histórico — não usar como referência ativa.

---

## Objetivo (histórico, não ativo)

Resolver conflitos entre pedido do usuário, Blueprint, padrão da organização, segurança, compatibilidade e custo.

## Precedência padrão (histórico, não ativo — ver [[Políticas de Decisão]])

Segurança e compliance → política legal/organizacional → aprovação explícita do usuário → Blueprint aprovado → padrão do workspace → preferência da conversa → sugestão da IA.

## Exemplo

Se o usuário pedir React, o Blueprint exigir Angular e a organização exigir Vue, a política bloqueia geração automática e solicita decisão explícita com impactos comparados.

## Aceitação

- [ ] Precedência é configurável por organização.
- [ ] Conflitos são explicados, não ocultados.
- [ ] Exceções exigem motivo e expiração opcional.
