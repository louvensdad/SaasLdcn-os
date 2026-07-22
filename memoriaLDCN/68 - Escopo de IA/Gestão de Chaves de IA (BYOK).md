# Gestão de Chaves de IA (BYOK)

## Princípio

O MLTagente não vende tokens de IA nem revende LLM. O usuário é responsável pelo consumo de IA: toda chamada a um provedor usa a API Key do próprio usuário. A assinatura cobra exclusivamente pela utilização da plataforma — ver [[Planos, assinaturas e controle de acesso]].

## Provedores e adaptadores

Provider Adapter Pattern: um contrato `LLMAdapter` comum implementado exclusivamente por `OpenAIAdapter`, `AnthropicAdapter`, `GoogleAdapter`, `DeepSeekAdapter` e `GroqAdapter` no MVP.

Fluxo de execução: `Agente → LLMRouter → Provider Adapter → vault criptografado do usuário → LLM`.

## Cadastro de chaves

Área: Configurações → Inteligência Artificial. O usuário pode cadastrar uma ou várias chaves, inclusive várias por provedor. Cada registro possui:

- `nome` — nome dado pelo usuário à chave
- `provedor`
- `apelido` (opcional)
- `status` (não testada / válida / inválida)
- `data de criação`
- `data da última utilização`
- `modelo padrão`
- `ativo` / `inativo`
- uma chave por provedor pode ser marcada como padrão (usada quando o agente não especifica outra)

As chaves são permanentes (não expiram) até serem removidas pelo usuário. Trocar uma chave é remover e cadastrar novamente — o valor bruto nunca é editável depois de criado.

## Segurança

- Chaves ficam sempre criptografadas em banco (nunca em texto puro).
- Nunca aparecem completas na interface após o cadastro — apenas mascaradas.
- Nunca são registradas em log.
- Nunca são enviadas ao frontend após o cadastro.
- São descriptografadas apenas no momento da chamada ao provedor.

## Validação antes da execução

Antes de qualquer agente ser executado, o sistema confirma: existe chave para o provedor exigido? Está ativa? O modelo selecionado existe? O provedor está disponível? Se qualquer verificação falhar, a execução é bloqueada antes de começar e o usuário vê, no idioma da interface:

> "Nenhuma API configurada. Cadastre uma chave em: Configurações → Inteligência Artificial"

## Modo MLTagente AI Cloud (futuro)

Não implementado agora. Qualquer ampliação futura do catálogo exige decisão arquitetural e de produto explícita. O MVP suporta somente OpenAI, Anthropic, Google, DeepSeek e Groq com chaves do usuário.
