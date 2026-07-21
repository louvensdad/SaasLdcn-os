# Protocolo de alteração incremental

## Fluxo

Pedido → classificação → arquivos afetados → impacto → snapshot → patch → build → testes → preview → aprovação → commit.

## Regras

- A alteração começa por uma versão imutável.
- O agente deve produzir patch mínimo, não regenerar o projeto inteiro.
- Arquivos fora do escopo são protegidos.
- Falha restaura snapshot ou mantém a versão não publicada.
- Alteração estrutural exige atualização de Blueprint e documentação.

## Saída

Change Request com intenção, diff, arquivos, impacto, testes, preview, aprovação e commit.

## Critérios de aceitação

- [ ] “Mude a cor do botão” não altera backend sem justificativa.
- [ ] Toda mudança tem diff e rollback.
- [ ] Testes e preview referenciam a mesma versão.
