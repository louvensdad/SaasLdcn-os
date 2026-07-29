# Diário de validação arquitetural

## Objetivo

Registrar quais decisões da arquitetura foram confirmadas pelo código, quais precisam ser ajustadas e quais ainda não foram testadas durante o vertical slice.

## Estados de validação

- **Confirmado pela implementação:** existe código executável e evidência reproduzível.
- **Precisa ser ajustado:** a implementação revelou uma inconsistência, limitação ou decisão melhor.
- **Ainda não foi testado:** a hipótese continua sem evidência suficiente.

## Registro inicial

| Decisão | Estado | Resultado | Evidência | Ajuste necessário |
|---|---|---|---|---|
| Prompt.md gera Blueprint válido | Ainda não foi testado | Pendente | Teste E2E | Definir após execução |
| Patch não regenera o projeto inteiro | Ainda não foi testado | Pendente | Diff do build | Medir arquivos e tempo afetados |
| Meta Engine coordena o fluxo | Ainda não foi testado | Pendente | Trace da execução | Validar checkpoints e transições |
| Rollback restaura a versão anterior | Ainda não foi testado | Pendente | Teste de rollback | Confirmar arquivos, banco e preview |
| Contratos permanecem compatíveis | Ainda não foi testado | Pendente | Testes de schema | Verificar versões suportadas |
| Eventos permitem reconstruir o estado | Ainda não foi testado | Pendente | Replay de eventos | Testar idempotência |
| Contexto recuperado é suficiente | Ainda não foi testado | Pendente | Trace de IA | Medir qualidade e custo |
| Preview executa a versão correta | Ainda não foi testado | Pendente | Teste de preview | Vincular versão, build e URL |

## Modelo para novos registros

| Decisão | Estado | Resultado | Evidência | Ajuste necessário |
|---|---|---|---|---|
| Nome da decisão | Ainda não foi testado | Pendente | Link para teste, log ou trace | Próxima ação |

## Regras

- Toda decisão importante validada deve apontar para código, teste, log, trace ou fixture.
- “Funciona” sem evidência permanece como hipótese.
- Ajustes devem gerar decisão, mudança de contrato ou atualização da documentação afetada.
- O diário deve ser revisado ao final de cada incremento do MVP.

## Relacionamentos

- [[Fluxo oficial do MVP]]
- [[Plano de implementação do vertical slice]]
- [[Matriz de rastreabilidade]]
- [[Definition of Done]]
- [[Meta Engine]]
- [[Mapa de contratos]]

## Critério de conclusão

O vertical slice estará arquiteturalmente validado quando todas as decisões críticas estiverem classificadas como confirmadas ou ajustadas, sem hipóteses críticas pendentes.
