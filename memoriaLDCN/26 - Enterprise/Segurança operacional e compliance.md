# Segurança operacional e compliance

## Objetivo

Transformar segurança conceitual em controles verificáveis: LGPD, GDPR, OWASP, secrets, Vault, rate limit, anti abuso, sandbox security, anti prompt injection e proteção contra código malicioso.

## Descrição completa

Inclui classificação de dados, DLP, retenção, direito de exclusão, gestão de secrets, escaneamento de dependências, SAST/DAST, malware scanning, isolamento, threat modeling, evidências e resposta a incidentes.

## Problema que resolve

Reduz risco de vazamento, execução maliciosa, abuso de IA, não conformidade e falha em auditorias.

## Fluxo

Entrada → classificação → sanitização → política → execução isolada → escaneamento → auditoria → retenção ou exclusão conforme regra.

## Dependências

Identidade, sandbox, storage, IA, logs, auditoria, backup e suporte jurídico.

## Relacionamentos

Afeta todos os domínios, especialmente MCP, marketplace, API pública e importação.

## Notas relacionadas

[[Programa de compliance]], [[Vault de secrets]], [[Threat modeling]], [[Anti abuso]], [[Scanning de dependências]], [[Resposta a incidentes]]

## Critérios de aceitação

- [ ] Secret nunca aparece em código, prompt, log ou artefato.
- [ ] Código importado e gerado passa por análise de risco.
- [ ] Usuário pode exercer retenção, exportação e exclusão de dados.
- [ ] Ferramentas e agentes têm allowlist de capacidades.
- [ ] Incidentes têm evidência, responsável e timeline.

## Prioridade

Crítica

## Fase

MVP para controles básicos; Enterprise para certificações e DLP avançado.
