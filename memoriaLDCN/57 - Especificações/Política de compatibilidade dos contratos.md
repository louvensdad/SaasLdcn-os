# Política de compatibilidade dos contratos

## Versionamento

- Patch: correção de descrição, exemplo ou bug sem alterar estrutura ou significado.
- Minor: campo opcional novo, novo evento compatível ou extensão que consumidores antigos ignoram.
- Major: campo removido, obrigatório novo, mudança de significado, enum incompatível ou alteração de comportamento.

## Retenção

Versões antigas permanecem aceitas por no mínimo duas versões minor ou 90 dias, o que for maior. Contratos críticos podem ter prazo maior definido pelo proprietário.

## Migração

Nova versão → adaptador compatível → período de observação → migração dos consumidores → remoção anunciada → encerramento após prazo.

## Descoberta

Agentes e serviços descobrem a versão pelo manifesto do contrato, endpoint de capabilities ou header de negociação. O consumidor deve declarar a versão suportada.

## Critérios de aceitação

- [ ] Breaking changes exigem major.
- [ ] Depreciações têm data e alternativa.
- [ ] Consumidores incompatíveis falham antes de executar.
- [ ] Schemas possuem testes de compatibilidade backward e forward.
