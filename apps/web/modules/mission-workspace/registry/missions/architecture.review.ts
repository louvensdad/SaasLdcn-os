import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: readonly MissionStepDefinition[] = [
  { id: 'material', title: 'Arquitetura atual', description: 'Registre diagramas, decisões e limites conhecidos.', specialist: 'software_architect', fields: [
    { id: 'current_architecture', label: 'Descrição ou material da arquitetura', type: 'textarea', required: true, aiActions: [{ id: 'extract', label: 'Extrair componentes', prompt: 'Extraia componentes, responsabilidades e relações apenas deste material: {{current_architecture}}. Marque lacunas.', insertMode: 'suggest' }] },
    { id: 'review_goal', label: 'Objetivo da revisão', type: 'textarea', required: true, aiActions: [] },
  ] },
  { id: 'quality_attributes', title: 'Atributos de qualidade', description: 'Defina prioridades e evidências esperadas.', specialist: 'software_architect', fields: [
    { id: 'priorities', label: 'Prioridades', type: 'multiselect', options: ['Segurança', 'Performance', 'Escalabilidade', 'Disponibilidade', 'Manutenibilidade', 'Custo'], required: true, aiActions: [{ id: 'recommend', label: 'Priorizar', prompt: 'Priorize atributos para {{review_goal}} usando apenas o contexto disponível e explique pendências.', insertMode: 'suggest' }] },
  ] },
  { id: 'evidence', title: 'Evidências', description: 'Relacione decisões a fatos observáveis.', specialist: 'risk_analyst', fields: [
    { id: 'evidence_log', label: 'Evidências disponíveis', type: 'textarea', required: true, aiActions: [{ id: 'organize', label: 'Organizar evidências', prompt: 'Organize as evidências {{evidence_log}} por atributo {{priorities}} sem criar evidência nova.', insertMode: 'suggest' }] },
  ] },
  { id: 'findings', title: 'Descobertas', description: 'Registre riscos, trade-offs e forças.', specialist: 'security_engineer', fields: [
    { id: 'findings', label: 'Descobertas da revisão', type: 'textarea', required: true, aiActions: [{ id: 'review', label: 'Executar revisão', prompt: 'Revise a arquitetura {{current_architecture}} contra prioridades {{priorities}} e evidências {{evidence_log}}. Separe fato, inferência e pendência.', insertMode: 'suggest' }] },
  ] },
  { id: 'recommendations', title: 'Recomendações', description: 'Proponha mudanças explícitas e impactos.', specialist: 'software_architect', fields: [
    { id: 'recommendations', label: 'Recomendações priorizadas', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar recomendações', prompt: 'Para as descobertas {{findings}}, proponha estado atual, mudança, motivo, impacto e validação.', insertMode: 'suggest' }] },
  ] },
];

export const architectureReviewGenome: MissionGenome = {
  id: 'architecture.review', category: 'analyze', title: 'Revisar arquitetura',
  description: 'Avalie decisões arquiteturais contra evidências, atributos de qualidade e riscos.',
  icon: 'Network', estimatedTime: '25–60 min', complexity: 7,
  specialists: ['software_architect', 'security_engineer', 'performance_analyst', 'risk_analyst'],
  executionModes: ['guided', 'analysis', 'expert', 'collaborative'], inputTypes: ['text', 'files', 'urls', 'schemas', 'project_ref'],
  steps, conditionalSteps: [], validations: [],
  gapRules: [{ id: 'missing_evidence', check: (ctx) => !ctx.answers['evidence.evidence_log'], title: 'Revisão sem evidências', severity: 'critical', suggestedAction: 'Adicione documentos, métricas ou decisões observáveis.', relatedStepId: 'evidence' }],
  riskRules: [{ id: 'recommendation_without_evidence', check: (ctx) => Boolean(ctx.answers['recommendations.recommendations']) && !ctx.answers['evidence.evidence_log'], severity: 'high', category: 'governance', title: 'Recomendação sem rastreabilidade', description: 'A recomendação não está sustentada por evidência registrada.', suggestedAction: 'Vincule a recomendação a evidências.', affectedSteps: ['evidence', 'recommendations'] }],
  artifacts: [{ type: 'report', title: 'Relatório de Revisão Arquitetural', format: 'markdown' }, { type: 'roadmap', title: 'Roadmap de Evolução', format: 'markdown', canFeedMission: ['system.modernize'] }],
  knowledgeTopics: ['architecture_quality_attributes', 'adr_review', 'threat_modeling'], canReceiveFrom: ['software.build'], canFeedInto: ['system.modernize'],
};
