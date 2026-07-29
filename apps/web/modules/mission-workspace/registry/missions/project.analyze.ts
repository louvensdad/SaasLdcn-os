import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: MissionStepDefinition[] = [
  { id: 'scope', title: 'Escopo e objetivo da análise', description: 'O que será analisado e por quê.', specialist: 'risk_analyst',
    fields: [{ id: 'objective', label: 'Objetivo da análise', type: 'textarea', required: true, aiActions: [] }] },
  { id: 'input_material', title: 'Material de entrada', description: 'Código, documentação ou arquitetura fornecidos.', specialist: 'risk_analyst',
    fields: [{ id: 'material_summary', label: 'Resumo do material fornecido', type: 'textarea', required: true, aiActions: [
      { id: 'summarize', label: 'Resumir', insertMode: 'replace', prompt: 'Resuma objetivamente este material de projeto para fins de análise: "{{material_summary}}"' },
    ] }] },
  { id: 'dimension_analysis', title: 'Análise por dimensão', description: 'Qualidade, segurança, performance, dívida técnica.', specialist: 'performance_analyst',
    fields: [{ id: 'dimensions', label: 'Dimensões avaliadas', type: 'chips', aiActions: [
      { id: 'suggest', label: 'Sugerir dimensões', insertMode: 'suggest', prompt: 'Para o material "{{material_summary}}", quais dimensões (qualidade, segurança, performance, dívida técnica) merecem análise prioritária?' },
    ] }] },
  { id: 'findings_evidence', title: 'Descobertas e evidências', description: 'O que foi encontrado, com evidências.', specialist: 'security_auditor',
    fields: [{ id: 'findings', label: 'Descobertas', type: 'textarea', required: true, aiActions: [
      { id: 'generate', label: 'Gerar descobertas', insertMode: 'replace', prompt: 'Com base no material "{{material_summary}}" e nas dimensões "{{dimensions}}", liste descobertas concretas com evidências.' },
    ] }] },
  { id: 'severity_priority', title: 'Severidade e priorização', description: 'Classificação de risco e ordem de tratamento.', specialist: 'risk_analyst',
    fields: [{ id: 'priority_ranking', label: 'Priorização', type: 'textarea', aiActions: [
      { id: 'rank', label: 'Priorizar descobertas', insertMode: 'replace', prompt: 'Priorize estas descobertas por severidade e urgência: "{{findings}}"' },
    ] }] },
  { id: 'recommendations', title: 'Recomendações', description: 'O que fazer a respeito de cada descoberta.', specialist: 'risk_analyst',
    fields: [{ id: 'recommendations_text', label: 'Recomendações', type: 'textarea', aiActions: [
      { id: 'generate', label: 'Gerar recomendações', insertMode: 'replace', prompt: 'Gere recomendações acionáveis para as descobertas priorizadas: "{{priority_ranking}}"' },
    ] }] },
  { id: 'action_plan', title: 'Plano de ação', description: 'Passos concretos e responsáveis.', specialist: 'risk_analyst',
    fields: [{ id: 'action_items', label: 'Itens de ação', type: 'textarea', aiActions: [
      { id: 'generate', label: 'Gerar plano', insertMode: 'replace', prompt: 'Transforme estas recomendações em um plano de ação com passos concretos: "{{recommendations_text}}"' },
    ] }] },
  { id: 'final_report', title: 'Relatório final', description: 'Consolidação em um relatório executivo.', specialist: 'risk_analyst', fields: [] },
];

export const projectAnalyzeGenome: MissionGenome = {
  id: 'project.analyze',
  category: 'analyze',
  title: 'Analisar projeto ou código existente',
  primaryActionLabel: 'Iniciar análise do projeto',
  description: 'Diagnóstico estruturado por dimensão, com severidade, priorização e plano de ação.',
  icon: 'ScanSearch',
  estimatedTime: '20–45 min',
  complexity: 5,
  specialists: ['performance_analyst', 'security_auditor', 'risk_analyst'],
  executionModes: ['guided', 'analysis', 'expert'],
  inputTypes: ['text', 'files', 'urls'],
  steps,
  conditionalSteps: [],
  validations: [],
  gapRules: [],
  riskRules: [],
  artifacts: [{ type: 'report', title: 'Relatório de Análise', format: 'markdown', canFeedMission: [] }],
  knowledgeTopics: ['analysis_frameworks', 'severity_models'],
};
