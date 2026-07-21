# Plano de implementação do vertical slice

## Projeto de teste

Lista de tarefas com título, descrição, status, prioridade e data.

## Fluxo

Criar projeto → enviar ideia → gerar Prompt.md → editar e aprovar → gerar Blueprint → gerar plano → criar aplicação Web mínima → build → preview → pedir “adicione prioridade” → aplicar patch → novo build → preview atualizado.

## Stack fixa

- Frontend: React + TypeScript
- Backend: Node.js + TypeScript
- Banco: PostgreSQL
- Runtime: Docker
- Comunicação: REST + SSE
- Storage: filesystem local com interface abstrata
- IA: um provedor por trás do LLM Contract
- Deploy: preview local gerenciado

## Fora do corte

Java, Python, Flutter, múltiplos provedores, pagamentos, OAuth social, Kubernetes, Firecracker e infraestrutura externa.

## Critérios de aceitação

- [ ] Usuário conclui o fluxo sem terminal local.
- [ ] CRUD de tarefas funciona no preview.
- [ ] Build, logs, eventos e erros são rastreáveis.
- [ ] Alteração de prioridade produz patch incremental.
- [ ] Novo preview reflete a alteração.
- [ ] Rollback restaura a versão anterior.
