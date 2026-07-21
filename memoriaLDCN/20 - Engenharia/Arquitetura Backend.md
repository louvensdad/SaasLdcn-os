# Arquitetura Backend

## Camadas

API Gateway → autenticação/autorização → aplicação → orquestração → workers → persistência → eventos → observabilidade.

## Responsabilidades

O backend coordena projetos, agentes, execuções, versões, previews, deploys, memórias, automações, billing e permissões.

## Regras

Operações longas devem ser assíncronas, idempotentes, auditáveis e acompanhadas por status.
