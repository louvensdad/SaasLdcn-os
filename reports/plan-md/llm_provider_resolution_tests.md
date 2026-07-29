# LLM Provider Resolution Tests

## Cobertura

`apps/api/tests/test_global_llm_orchestration.py` cobre:

1. Claude configurado e detectado globalmente.
2. Estado seguro do endpoint ativo.
3. Ausência de provider com motivo determinístico.
4. Troca de provider refletida na próxima confirmação.
5. Padronização de aliases.
6. Chave ausente/expirada com erro explícito.
7. Fallback determinístico auditado.
8. Resolução uniforme para Project Room, PromptMaster, Architect, Blueprint, Engineering
   Review, Meta-Fábrica, Documentation, Modernize, Laboratory, Auto Repair, codebase,
   security e architecture analysis.

## Resultado

Suíte focal: 35 testes aprovados inicialmente. Após migração dos consumidores principais,
foram executados também Project Room e Documentation; a regressão de mensagem de chave foi
ajustada para preservar o contrato anterior.

