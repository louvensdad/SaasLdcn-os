# LLM Security Validation

## Controles verificados

- API key não pertence a nenhum schema de resposta de settings.
- `GET /llm/settings/active` retorna apenas `hasKey`.
- Vault mantém segredo criptografado em RAM e aplica TTL.
- Logs de auditoria recebem somente event codes allowlisted.
- Provider/model viajam no backend por contexto interno; o segredo não entra em prompts.
- Remoção de chave apaga vault e seleção ativa.
- Exports continuam protegidos pelo scanner existente do pipeline.

## Evidência automatizada

`test_global_llm_orchestration.py` verifica que a chave não aparece na resposta ativa.
`test_user_ai_keys.py` cobre máscara, isolamento, remoção e ausência de fallback silencioso
para chave inválida.

