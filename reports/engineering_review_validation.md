# Engineering Review Validation

## Validacoes cobertas

- Dashboard da revisao renderiza resumo, diagrama, custos, riscos e oportunidades.
- Projeto com `BLUEPRINT_READY` entra no Engineering Review.
- Botao de envio para Meta-Fabrica fica bloqueado antes da aprovacao.
- Aceitar Arquitetura muda o estado para aprovado e libera envio.
- Modo deterministico e modo LLM sao exibidos de forma explicita.

## Origem dos dados

- PromptMaster e spec do Project Room.
- Architecture Blueprint salvo pelo Architect Engine.
- Status de IA vindo de `/api/ai-status`.
- Custos, arquivos, endpoints e tempo aparecem como estimativas.
