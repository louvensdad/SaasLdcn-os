# Planejamento de migração

## Objetivo

Converter um sistema existente para outra tecnologia ou versão preservando comportamento, dados e disponibilidade.

## Fluxo

Diagnóstico → definição de destino → matriz de incompatibilidades → plano por fases → branch ou ambiente paralelo → conversão → testes → migração de dados → cutover → monitoramento → rollback.

## Exemplos

Angular para React, Java 11 para Java 21, Spring Boot 2 para versão atual e Oracle para PostgreSQL.

## Dependências

Engenharia reversa, Blueprint, sistema de versões, banco, testes e deploy.

## Critérios de aceitação

- [ ] Compatibilidades e perdas conhecidas são listadas.
- [ ] Dados possuem backup e validação de integridade.
- [ ] Migração pode ser pausada e revertida.
- [ ] Cutover possui janela, métricas e plano de contingência.

## Prioridade

Alta

## Fase

Beta
