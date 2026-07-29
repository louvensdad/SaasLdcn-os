# Arquitetura do contexto

## Objetivo

Montar o contexto mínimo e correto para cada decisão da IA.

## Camadas

Conversa atual → projeto → workspace → organização → conhecimento geral permitido.

## Fluxo

Pedido → classificação de intenção → seleção de escopo → recuperação → compressão → resolução de conflito → prompt final → registro de uso.

## Dependências

Sistema de memória, Blueprint, segurança, billing e plataforma de IA.

## Critérios de aceitação

- [ ] Contexto possui origem e escopo visíveis.
- [ ] Segredos e dados fora da autorização são excluídos.
- [ ] Limite de tokens não elimina fatos críticos sem aviso.

## Prioridade

Crítica

## Fase

MVP
