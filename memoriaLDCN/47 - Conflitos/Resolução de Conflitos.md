# Resolução de Conflitos

## Objetivo

Resolver alterações concorrentes em arquivos, Blueprint, memória, banco, automações e configurações.

## Fluxo

Detectar versão divergente → classificar conflito → tentar merge semântico → executar testes → solicitar revisão humana quando ambíguo → registrar resolução.

## Dependências

Sistema de versões, colaboração, contratos, agentes e qualidade.

## Aceitação

- [ ] Nenhuma alteração é perdida silenciosamente.
- [ ] Conflitos exibem origem, autor e impacto.
- [ ] Merge automático exige validação.
- [ ] Resolução pode ser desfeita.
