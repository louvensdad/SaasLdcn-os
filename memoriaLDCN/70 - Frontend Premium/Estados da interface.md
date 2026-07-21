# Estados da interface

## Projeto

Novo → Criando → Analisando → Planejando → Gerando → Build → Preview → Pronto → Erro → Rollback.

## Regra

Cada estado possui visual, ação principal, ação secundária, mensagem, permissões, loading e caminho de recuperação.

## Critérios

- [ ] Estado global e estado local não entram em conflito.
- [ ] Transições são acionadas por eventos reais.
- [ ] Usuário consegue distinguir aguardando, executando e travado.
