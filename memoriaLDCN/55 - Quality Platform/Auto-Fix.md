# Auto-Fix

## Objetivo

Encaminhar falhas elegíveis para correção automática sem mascarar a causa nem alterar escopo indevido.

## Fluxo

Falha → diagnóstico → patch mínimo → snapshot → testes → gate → preview → aprovação ou rollback.

## Critérios de aceitação

- [ ] Patch aponta para a falha original.
- [ ] Correção não publica diretamente em produção.
- [ ] Falhas repetidas são escaladas para revisão humana.
