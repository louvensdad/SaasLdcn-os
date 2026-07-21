# Sistema de simulação

## Objetivo

Estimar comportamento do sistema antes da publicação sob carga, falhas e dependências indisponíveis.

## Cenários

10, 100, 1.000 e 10.000 usuários; banco lento ou indisponível; perda de conexão; API externa fora do ar; servidor degradado.

## Fluxo

Definir cenário → clonar ambiente → gerar carga/falha controlada → medir → comparar SLO → recomendar alteração → descartar ambiente.

## Dependências

Sandbox, observabilidade, testes de carga, custos e deploy.

## Critérios de aceitação

- [ ] Simulação não afeta produção.
- [ ] Cenários são reproduzíveis.
- [ ] Resultados incluem custo, latência, erros e saturação.
- [ ] Falhas injetadas podem ser interrompidas com segurança.

## Prioridade

Baixa

## Fase

Enterprise
