# Sistema de compatibilidade

## Objetivo

Verificar comportamento visual e funcional em Chrome, Edge, Firefox, Safari, Android, iPhone e tablets antes do deploy.

## Fluxo

Definir matriz → provisionar navegadores/dispositivos → executar testes → capturar screenshots e logs → comparar baseline → classificar falha → aprovar ou bloquear.

## Dependências

Preview, testes visuais, E2E, CI/CD e catálogo de browsers.

## Critérios de aceitação

- [ ] Matriz de suporte é explícita por projeto.
- [ ] Falhas incluem ambiente e reprodução.
- [ ] Regressão visual é comparável.
- [ ] Dispositivo indisponível não gera falso sucesso.

## Prioridade

Média

## Fase

Beta
