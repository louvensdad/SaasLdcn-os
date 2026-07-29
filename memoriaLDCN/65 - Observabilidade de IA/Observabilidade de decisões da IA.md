# Observabilidade de decisões da IA

## Objetivo

Explicar e depurar como a IA chegou a uma decisão.

## Registro mínimo

Modelo e versão, prompt versionado, contexto recuperado, memórias usadas, documentos influentes, ferramentas chamadas, agentes envolvidos, política aplicada, alternativas, decisão, confiança, latência, tokens e custo.

## Fluxo

Execução → eventos de raciocínio operacional → span de ferramenta/modelo → resultado → avaliação → custo e auditoria.

## Privacidade

Conteúdo sensível deve ser mascarado ou referenciado por hash; logs não devem armazenar secrets ou dados além da retenção permitida.

## Critérios de aceitação

- [ ] É possível explicar por que um modelo ou agente foi escolhido.
- [ ] Cada resposta aponta para contexto e políticas aplicadas.
- [ ] Custos são atribuídos à decisão e ao projeto.
- [ ] Rastreamento não expõe dados protegidos.
