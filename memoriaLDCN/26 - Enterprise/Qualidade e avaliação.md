# Qualidade e avaliação

## Objetivo

Medir qualidade do software e da IA por testes automáticos, visuais, E2E, carga, segurança, acessibilidade, benchmark de código e avaliação de agentes.

## Descrição completa

Cada alteração deve ser avaliada por uma matriz proporcional ao risco. A plataforma compara regressões, flakiness, cobertura, latência, vulnerabilidades, acessibilidade e qualidade da resposta da IA.

## Problema que resolve

Evita que velocidade de geração produza sistemas frágeis ou respostas convincentes, porém incorretas.

## Fluxo

Mudança → seleção da suíte → execução paralela → coleta de evidências → comparação com baseline → decisão → bloqueio ou aprovação.

## Dependências

Build pipeline, sandbox, preview, observabilidade, agentes QA e sistema de versões.

## Relacionamentos

Conecta deploy, revisão, billing de execução e explicabilidade.

## Notas relacionadas

[[Matriz de testes]], [[Testes visuais]], [[Testes E2E]], [[Testes de carga]], [[Testes de acessibilidade]], [[Benchmark de código]]

## Critérios de aceitação

- [ ] Suítes são reproduzíveis e versionadas.
- [ ] Falhas apontam evidência e provável causa.
- [ ] Regressões visuais podem ser comparadas.
- [ ] Deploy pode ser bloqueado por política de qualidade.
- [ ] Métricas de qualidade da IA possuem conjunto de avaliação.

## Prioridade

Crítica

## Fase

MVP para build e E2E; Beta para avaliação avançada.
