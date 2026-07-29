# Fluxo do Preview

Projeto → Docker ou runtime isolado → Build → Frontend → Backend → Banco → Proxy → Navegador → Logs → Monitoramento da IA.

## Regras

- O preview usa uma versão identificável.
- Portas internas nunca são expostas diretamente.
- Falhas são agrupadas por causa provável.
- Live reload atualiza somente após build válido.
- O usuário pode reiniciar o ambiente sem perder a versão.

Relacionados: [[Motor de execução do MLTagente]], [[Navegador integrado]], [[Sandbox de execução]]
