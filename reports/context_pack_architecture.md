# Arquitetura de Context Packs

Cada agente recebe um pack específico construído por `context_pack_builder`.

| Agente | Entradas principais |
|---|---|
| Contracts | resumo, entidades, fluxos, API, auth e integrações |
| Backend | OpenAPI resumido, domínio, banco, auth e segurança |
| Frontend | rotas, telas/personas, design system e OpenAPI |
| QA | endpoints, regras e inventário de arquivos |
| Docs | Blueprint, contratos e decisões validadas |

Antes do envio são aplicados deduplicação, orçamento por papel, compressão e estimativa de tokens. O contrato completo não é replicado: apenas um resumo de endpoints entra nos packs posteriores. O checkpoint registra bytes e tokens estimados de cada requisição.

Em payload excessivo, o guard comprime antes da chamada. HTTP 413 força recompressão e retry particionado.
