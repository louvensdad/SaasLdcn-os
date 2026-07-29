import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: MissionStepDefinition[] = [
  {
    id: 'observed_error',
    title: 'Erro observado',
    description: 'O que está acontecendo.',
    specialist: 'backend_engineer',
    fields: [
      { id: 'error_description', label: 'Descreva o erro', type: 'textarea', required: true, aiActions: [] },
      { id: 'expected_behavior', label: 'O que deveria acontecer?', type: 'textarea', required: true, aiActions: [] },
      {
        id: 'stack_trace', label: 'Stack trace ou log do erro', type: 'code',
        aiActions: [
          { id: 'analyze', label: 'Analisar', insertMode: 'suggest',
            prompt: 'Analise este stack trace/log considerando a stack {{stack_context}}. Identifique: causa provável, arquivo e linha mais relevante, explicação para não-especialista. Stack trace: "{{stack_trace}}"' },
        ],
      },
      { id: 'stack_context', label: 'Qual a stack do projeto?', description: 'Linguagem, framework, versões relevantes.', type: 'text', aiActions: [] },
    ],
  },
  {
    id: 'reproduction',
    title: 'Reprodução do problema',
    description: 'Como e onde o erro acontece.',
    specialist: 'qa_engineer',
    fields: [
      { id: 'steps_to_reproduce', label: 'Passos para reproduzir', type: 'textarea', aiActions: [] },
      { id: 'environment', label: 'Ambiente onde ocorre', type: 'select', options: ['Desenvolvimento', 'Testes', 'Staging', 'Produção', 'Todos'], aiActions: [] },
      { id: 'frequency', label: 'Com que frequência ocorre?', type: 'select', options: ['Sempre', 'Intermitente', 'Apenas em condições específicas', 'Primeira vez'], aiActions: [] },
    ],
  },
  {
    id: 'diagnosis',
    title: 'Diagnóstico',
    description: 'A IA analisa tudo e identifica a causa raiz.',
    specialist: 'backend_engineer',
    fields: [
      {
        id: 'ai_diagnosis', label: 'Diagnóstico da IA', type: 'textarea',
        aiActions: [
          {
            id: 'run_diagnosis', label: 'Executar diagnóstico completo', insertMode: 'replace',
            prompt: `Você é um engenheiro sênior especializado em {{stack_context}}.

Analise as seguintes informações:

ERRO OBSERVADO: {{error_description}}
COMPORTAMENTO ESPERADO: {{expected_behavior}}
STACK TRACE: {{stack_trace}}
PASSOS PARA REPRODUÇÃO: {{steps_to_reproduce}}
AMBIENTE: {{environment}}
FREQUÊNCIA: {{frequency}}

Produza um diagnóstico estruturado com:
1. Causa raiz mais provável
2. Evidências que sustentam esse diagnóstico
3. Causas alternativas possíveis
4. Arquivos ou componentes provavelmente afetados
5. Impacto do problema

Seja específico. Não dê respostas genéricas.`,
          },
        ],
      },
    ],
  },
  {
    id: 'fix',
    title: 'Correção proposta',
    description: 'Solução e prevenção de regressão.',
    specialist: 'backend_engineer',
    fields: [
      {
        id: 'proposed_fix', label: 'Solução proposta', type: 'textarea',
        aiActions: [
          { id: 'generate_fix', label: 'Gerar correção', insertMode: 'replace',
            prompt: 'Com base no diagnóstico "{{ai_diagnosis}}", gere: 1. A correção específica (com código quando relevante) 2. Instruções de aplicação passo a passo 3. Como validar que o problema foi resolvido 4. Como evitar que volte a ocorrer. Stack: {{stack_context}}' },
        ],
      },
      {
        id: 'regression_prevention', label: 'Prevenção de regressão', type: 'textarea',
        aiActions: [
          { id: 'generate', label: 'Gerar teste de regressão', insertMode: 'replace',
            prompt: 'Gere um teste de regressão para garantir que este erro não volte a ocorrer. Stack: {{stack_context}}. Problema: {{error_description}}. Correção: {{proposed_fix}}' },
        ],
      },
    ],
  },
];

export const errorDiagnoseGenome: MissionGenome = {
  id: 'error.diagnose',
  category: 'fix',
  title: 'Diagnosticar erro',
  primaryActionLabel: 'Iniciar diagnóstico do erro',
  description: 'Identifique a causa raiz de um bug, falha de build, erro de integração ou comportamento inesperado.',
  icon: 'SearchCode',
  estimatedTime: '10–30 min',
  complexity: 4,
  specialists: ['backend_engineer', 'security_engineer', 'devops_engineer'],
  executionModes: ['guided', 'analysis', 'expert'],
  inputTypes: ['text', 'code', 'logs', 'files'],
  steps,
  conditionalSteps: [],
  validations: [],
  gapRules: [],
  riskRules: [],
  artifacts: [
    { type: 'diagnosis', title: 'Relatório de Diagnóstico', format: 'markdown', canFeedMission: [] },
  ],
  knowledgeTopics: ['common_errors', 'debugging_tools', 'stack_specific_issues'],
};
