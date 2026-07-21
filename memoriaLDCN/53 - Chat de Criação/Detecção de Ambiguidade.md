# Detecção de Ambiguidade

## Objetivo

Encontrar termos ou intenções que podem produzir soluções incompatíveis.

## Exemplos

“Usuários” pode significar equipe interna ou clientes; “pagamento” pode significar registro manual ou transação real.

## Fluxo

Extrair termos → gerar interpretações → estimar impacto → perguntar ou escolher padrão explicitamente → registrar decisão.

## Critérios de aceitação

- [ ] Ambiguidades de alto risco bloqueiam avanço.
- [ ] Ambiguidades de baixo risco geram suposição visível.
- [ ] Resolução entra no Prompt.md e na memória apropriada.
