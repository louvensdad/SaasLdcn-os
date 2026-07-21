# Arquitetura MCP

## Objetivo

Padronizar a comunicação dos agentes com sistemas externos e ferramentas internas.

## Integrações previstas

GitHub, Docker, AWS, OpenAI, Claude, Gemini, bancos de dados, filesystem, terminal, browser, n8n, Slack e WhatsApp.

## Contrato de uma ferramenta

Nome, descrição, schema de entrada, saída, permissões, limites, auditoria, timeout, tratamento de erro e política de confirmação.

## Segurança

Cada servidor MCP recebe somente escopos necessários. Ações destrutivas exigem confirmação ou política explícita do workspace.
