# Mapa de APIs

## Projetos

- `POST /projects`
- `GET /projects/:id`
- `PATCH /projects/:id`

## Execução

- `POST /build`
- `POST /preview`
- `GET /status/:run_id`
- `GET /logs/:run_id`
- `POST /deploy`

## IA e agentes

- `POST /agent`
- `GET /agent-runs/:id`
- `GET /memories`
- `POST /memories`

## Automações

- `POST /automation`
- `POST /automation/:id/test`
- `POST /automation/:id/activate`

Todas as operações precisam de autenticação, autorização, idempotency key quando alteram estado e correlação de logs.


APIs de pricing, billing, entitlements e verificação estudantil: [[Planos, assinaturas e controle de acesso]].


As APIs de Plano Estudante reutilizam o contrato de assinatura e entitlements do Básico.
