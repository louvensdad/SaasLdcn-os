# Matriz de permissões por ação

| Ação | Proprietário | Administrador | Desenvolvedor | Revisor | Visualizador |
|---|---:|---:|---:|---:|---:|
| Editar Blueprint | Sim | Sim | Sim | Não | Não |
| Executar build | Sim | Sim | Sim | Não | Não |
| Publicar produção | Sim | Configurável | Configurável | Não | Não |
| Ver secrets | Restrito | Restrito | Não | Não | Não |
| Restaurar versão | Sim | Sim | Configurável | Não | Não |
| Aprovar alteração | Sim | Sim | Configurável | Sim | Não |

## Regras

ABAC pode restringir por projeto, ambiente, classificação de dados, horário, IP ou aprovação. Negação prevalece sobre permissão ampla.

## Critérios de aceitação

- [ ] Toda ação é avaliada no recurso e no ambiente.
- [ ] Decisão de autorização é auditada.
- [ ] Permissões efetivas são explicáveis.
