# LLM Contract

## Objetivo

Uniformizar provedores e modelos de IA.

## Princípio BYOK

O MLTagente não revende LLM. Toda execução usa a API Key do próprio usuário; a plataforma nunca fornece créditos de IA (ver [[Planos, assinaturas e controle de acesso]]). Provedores suportados: OpenAI, Anthropic Claude, Google Gemini, Groq, OpenRouter, Ollama, LM Studio e endpoints customizados compatíveis com a API OpenAI. Novos provedores são adicionados via Provider Adapter, sem alterar o núcleo do sistema nem os agentes.

## Entrada e saída

Entrada: mensagens, ferramentas, contexto, parâmetros e política de dados. Saída: resposta, chamadas de ferramenta, tokens, custo, latência, modelo e segurança.

## Autoridade

Intelligence Engine seleciona; Provider Adapter executa; Governance valida permissões.

## Aceitação

- [ ] Provedores podem ser substituídos sem alterar agentes.
- [ ] Tokens e custos são medidos.
- [ ] Timeout, retry e fallback são padronizados.
