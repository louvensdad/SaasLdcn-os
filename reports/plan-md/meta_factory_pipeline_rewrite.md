# Meta-Fábrica — reescrita da pipeline

## Resultado

A geração canônica iniciada pelo Project Room deixou de depender do estado do navegador e de uma resposta única. Cada execução cria um `GenerationJob` no SQLite antes da primeira chamada ao provider. Um worker executa etapas ordenadas, grava artefatos/checkpoints e publica o estado por SSE.

Ordem efetiva: product spec normalizada → domain model → OpenAPI → database schema → backend em 12 chunks → frontend → security → tests → docs → build local → package.

## Garantias

- `READY` exige build aprovado e ZIP preparado.
- Respostas brutas e diagnósticos ficam preservados.
- Refresh consulta o job por `projectId`; não reinicia a geração.
- Provider é resolvido globalmente. Modo LLM sem provider retorna conflito explícito.
- Fallback determinístico só ocorre por ação explícita.
- A UI mostra estado real, etapa, progresso, logs, artefatos e recuperação.

## Compatibilidade

O fluxo manual legado permanece disponível. Projetos aprovados do Project Room usam exclusivamente a nova pipeline persistente.
