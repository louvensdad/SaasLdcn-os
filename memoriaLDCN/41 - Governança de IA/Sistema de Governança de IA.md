# Sistema de Governança de IA

## Objetivo

Controlar modelos, dados, ferramentas, agentes, decisões, aprovações e riscos de IA em ambientes empresariais.

## Perguntas respondidas

- Qual modelo acessou dados confidenciais?
- Qual agente executou comandos?
- Quem aprovou uma alteração automática?
- Qual decisão foi tomada pela IA e qual por uma pessoa?

## Fluxo

Pedido → política de dados → seleção autorizada de modelo/agente → ferramenta com escopo → resultado → validação humana ou automática → auditoria → retenção.

## Dependências

Identidade, RBAC/ABAC, auditoria, plataforma de IA, MCP, billing e compliance.

## Relacionamentos

Conecta explicabilidade, memória, marketplace, agentes personalizados, segurança e qualidade.

## Notas relacionadas

[[Explainability da IA]], [[Avaliação de modelos]], [[Sistema Anti Prompt Injection]], [[Políticas RBAC e ABAC]]

## Critérios de aceitação

- [ ] Toda execução de IA possui modelo, versão, agente, ferramentas e usuário de origem.
- [ ] Acesso a dado sensível é justificado e auditado.
- [ ] Operações de alto risco exigem aprovação configurável.
- [ ] É possível reconstruir a cadeia de decisão.
- [ ] Políticas podem bloquear modelos, ferramentas ou agentes.

## Prioridade

Crítica

## Fase

Enterprise; controles mínimos entram no MVP.
