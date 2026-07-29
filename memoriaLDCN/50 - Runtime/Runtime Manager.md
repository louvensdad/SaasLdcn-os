# Runtime Manager

## Objetivo

Controlar ciclo de vida de containers e ambientes: iniciar, parar, reiniciar, escalar, atualizar e destruir.

## Fluxo

Contrato de execução → reservar recursos → iniciar runtime → health check → publicar estado → operar → reiniciar/escalar → encerrar e coletar artefatos.

## Dependências

Sistema de recursos, scheduler, sandbox, preview, deploy, logs e segurança.

## Aceitação

- [ ] Operações são idempotentes.
- [ ] Container órfão é detectado e encerrado.
- [ ] Reinício preserva diagnóstico e versão.
- [ ] Escala respeita quotas e custo.
