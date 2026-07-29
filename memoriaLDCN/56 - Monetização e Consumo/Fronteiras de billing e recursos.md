# Fronteiras de billing e recursos

## Billing

Planos, assinaturas, faturas e pagamentos da plataforma. Consumo de IA/tokens fica explicitamente fora do escopo de Billing: o MLTagente é BYOK (o usuário usa sua própria chave de provedor), então a plataforma nunca precifica, credita ou cobra por tokens — ver [[Planos, assinaturas e controle de acesso]].

## Metering

Medição imutável de CPU, RAM, disco, containers, builds e previews. Pode observar volume de chamadas de IA para fins de observabilidade (vault 65), mas essa observação nunca alimenta um limite comercial nem gera cobrança.

## Entitlements

Direitos de uso derivados do plano, contrato, créditos e políticas.

## Resource Manager

Reserva e limite operacional de recursos; não calcula preço.

## Critérios de aceitação

- [ ] Consumo possui origem e unidade.
- [ ] Cobrança pode ser reconciliada com medição.
- [ ] Limite operacional e limite comercial são distinguíveis.


A modalidade Estudante, sua elegibilidade e a separação entre preço e entitlement seguem [[Planos, assinaturas e controle de acesso]].
