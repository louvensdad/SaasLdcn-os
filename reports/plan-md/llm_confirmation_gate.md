# LLM Confirmation Gate

`useActiveLlm()` concentra cache, confirmaÃ§Ã£o e navegaÃ§Ã£o para Settings â†’ IA.

`LlmConfirmationGate` apresenta:

- provider e modelo ativos;
- capability/uso da aÃ§Ã£o;
- status pronto, ausente ou invÃ¡lido;
- continuar com o provider;
- trocar/configurar provider;
- modo determinÃ­stico explÃ­cito.

O painel usa a linguagem visual existente (tokens, badges e buttons), foco de teclado e
layout responsivo. Project Room usa o gate antes de gerar PromptMaster. O componente Ã©
reutilizÃ¡vel pelas demais superfÃ­cies sem duplicar lÃ³gica de provider.


## Cobertura real

Integrado: Project Room → Gerar PromptMaster.

Provider global detectado sem seleção local: Architect → Blueprint.

Pendente de integração visual do gate: regeneração/revisão em todas as variantes, Engineering Review, Modernize, Documentation, Laboratory e Auto Repair. O resolver backend já está disponível, mas disponibilidade do componente não equivale a cobertura visual concluída.