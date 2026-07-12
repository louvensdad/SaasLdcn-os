# Recuperação de falhas da Meta-Fábrica

O diagnóstico persistido contém etapa, agente, provider, modelo, HTTP status, bytes, tokens estimados, parser, validator, tentativa, path da resposta bruta, artefatos preservados e ação recomendada.

A UI oferece:

- reexecutar a etapa;
- reexecutar em modo particionado;
- escolher fallback determinístico específico;
- trocar provider global;
- continuar do último checkpoint;
- ver a resposta bruta;
- baixar diagnóstico;
- pausar a geração.

SSE transmite snapshots duráveis, não estado transitório do componente. Se a aba fechar, `latest?projectId=...` restaura o job e o stream reabre.
