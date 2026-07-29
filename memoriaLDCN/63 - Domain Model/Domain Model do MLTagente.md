# Domain Model do MLTagente

## Entidades centrais

### Organização

Unidade empresarial que define políticas, membros, contratos e governança.

### Workspace

Unidade de colaboração, cobrança, memória compartilhada e acesso a projetos.

### Projeto

Produto de software gerenciado pelo MLTagente, com intenção, Blueprint, versões, execuções, previews e deploys.

### Prompt

Representação estruturada da intenção do usuário antes da especificação técnica.

### Blueprint

Especificação estrutural aprovada que orienta planejamento e geração.

### Feature

Capacidade funcional evolutiva do projeto, composta por épicos, tarefas e mudanças.

### Versão

Snapshot imutável de arquivos, metadados e contratos de um projeto.

### Build

Processo que transforma uma versão em artefato executável.

### Execution

Execução rastreável de agente, build, teste, simulação ou operação.

### Preview

Ambiente temporário acessível para validar uma versão executável.

### Change Request

Pedido de alteração com escopo, impacto, patch, testes, aprovação e resultado.

## Relacionamentos

Organização → Workspaces → Projetos → Features → Tasks → Change Requests.

Projeto → Prompt → Blueprint → Versions → Builds → Executions → Previews → Deploys.

## Regra

O Domain Model é independente do banco, da API e da interface. Persistência e endpoints devem refletir esse modelo, não redefini-lo.


Entidades comerciais e autorização: [[Planos, assinaturas e controle de acesso]].
