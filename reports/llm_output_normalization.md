# Normalização de output LLM

O caminho de saída é: raw response → extractor tolerante → normalizer → schema/territory validation → retry de formato → artifact writer.

O parser aceita marcadores `FILE`, code fences Markdown com path, arrays JSON (incluindo trailing comma), XML e manifests incompletos. Manifests ausentes ou inválidos são sintetizados a partir dos arquivos recuperados.

Estratégias de retry:

1. contexto normal dentro do orçamento;
2. contexto reduzido com schema/protocolo explícito;
3. contexto particionado mínimo, sem repetição.

A resposta bruta é gravada mesmo quando nenhum arquivo é extraído. Fallback determinístico não é silencioso: somente uma ação explícita do usuário o aciona.
