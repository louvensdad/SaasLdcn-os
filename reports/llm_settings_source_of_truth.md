# LLM Settings — Source of Truth

O catálogo canônico fica em `llm_provider_registry.py`.

IDs suportados:

- `openai`
- `anthropic`
- `google`
- `deepseek`
- `openrouter`
- `ollama`

Aliases como `GPT`, `Claude`, `gemini`, `google_genai`, `open-router` e `local` são
normalizados na fronteira. Modelo e provider são validados como um par.

Salvar a primeira chave torna esse provider o padrão. Trocar o padrão via endpoint atualiza
imediatamente todas as resoluções posteriores. Remover a chave ativa remove a seleção.

As chaves continuam no vault criptografado em RAM, isolado por usuário e com TTL. Settings
mantém somente provider, modelo, status e timestamps seguros.

