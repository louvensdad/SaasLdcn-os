# Architecture Review Flow

## Fluxo oficial

1. Sala de Projeto IA captura a ideia e gera o PromptMaster.
2. O usuario aprova o PromptMaster.
3. Architect Engine gera o Blueprint com decisoes justificadas.
4. Engineering Review Center abre a revisao final.
5. O usuario aceita a arquitetura.
6. Meta-Fabrica recebe PromptMaster + Blueprint aprovado.

## Estados

- `PROMPT_READY`: PromptMaster pronto para aprovacao inicial.
- `APPROVED`: PromptMaster aprovado ou Engineering Review aprovado, dependendo da existencia de Blueprint.
- `BLUEPRINT_READY`: Architect Engine gerou Blueprint, mas ainda nao abriu review.
- `ENGINEERING_REVIEW`: Blueprint em revisao obrigatoria.
- `SENT_TO_GENERATOR`: handoff enviado a Meta-Fabrica.
- `GENERATED`: projeto gerado.

## Regra

`BLUEPRINT_READY` nao libera geracao. A Meta-Fabrica exige Blueprint presente e status aprovado apos review.
