# Global LLM Provider Orchestration

## ImplementaÃ§Ã£o

- `LlmSettingsService` Ã© a fonte de verdade do provider ativo por usuÃ¡rio.
- `LlmProviderResolver` recebe workspace, usuÃ¡rio, capability, override opcional e modo.
- Project Room, Documentation AI Writer e Meta-FÃ¡brica deixaram de resolver chaves localmente.
- O modelo resolvido acompanha o segredo apenas no backend por `LlmRoutingKey`; nunca integra responses.
- `GET /api/llm/settings/active`, `PUT /api/llm/settings/active` e
  `POST /api/llm/settings/confirm` formam o contrato global.

## Comportamento

Com provider vÃ¡lido, qualquer capability recebe o mesmo provider/model. Sem provider, o
resolver retorna fallback explicado. Uma escolha determinÃ­stica registra evento explÃ­cito.
O `MockAdapter` nÃ£o Ã© selecionado quando hÃ¡ chave global vÃ¡lida, pois o router recebe chave
e modelo fixados pelo resolver.

## Compatibilidade

Payloads antigos com `use_user_key` continuam aceitos. O source of truth global tem
precedÃªncia quando existe configuraÃ§Ã£o vÃ¡lida.


## Limites desta entrega

A resolução backend foi conectada diretamente a Project Room, Documentation, Meta-Fábrica e Modernize. Architect consome o estado global no frontend e suas gerações passam por Project Room. As rotas puramente determinísticas existentes (por exemplo, análises que não chamam `LLMRouter`) não foram convertidas artificialmente em ações LLM.

O gate visual está conectado à geração de PromptMaster no Project Room. As demais telas ainda precisam posicionar o componente reutilizável nos seus botões específicos para cumprir integralmente o critério de confirmação visual em toda a plataforma.