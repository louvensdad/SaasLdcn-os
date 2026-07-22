import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: readonly MissionStepDefinition[] = [
  { id: 'audience', title: 'Público e objetivo', description: 'Defina quem lê e o que deve conseguir fazer.', specialist: 'technical_writer', fields: [
    { id: 'audience', label: 'Público', type: 'chips', required: true, aiActions: [] },
    { id: 'goal', label: 'Objetivo da documentação', type: 'textarea', required: true, aiActions: [{ id: 'clarify', label: 'Clarificar objetivo', prompt: 'Reescreva {{goal}} como tarefa que o público {{audience}} deve concluir.', insertMode: 'suggest' }] },
  ] },
  { id: 'sources', title: 'Fontes verificáveis', description: 'Liste código, contratos e decisões disponíveis.', specialist: 'technical_writer', fields: [
    { id: 'sources', label: 'Fontes', type: 'textarea', required: true, aiActions: [{ id: 'inventory', label: 'Organizar fontes', prompt: 'Organize estas fontes por confiabilidade e cobertura: {{sources}}. Não invente conteúdo.', insertMode: 'suggest' }] },
  ] },
  { id: 'structure', title: 'Estrutura', description: 'Monte a arquitetura da informação.', specialist: 'technical_writer', fields: [
    { id: 'outline', label: 'Sumário proposto', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar sumário', prompt: 'Crie um sumário para {{goal}} dirigido a {{audience}} usando apenas as fontes {{sources}}. Marque seções sem fonte.', insertMode: 'suggest' }] },
  ] },
  { id: 'content', title: 'Conteúdo', description: 'Redija com exemplos e pendências explícitas.', specialist: 'technical_writer', fields: [
    { id: 'draft', label: 'Rascunho', type: 'textarea', required: true, aiActions: [{ id: 'draft', label: 'Gerar rascunho', prompt: 'Redija a documentação conforme {{outline}}. Use somente {{sources}} e marque [PENDENTE] onde faltar informação.', insertMode: 'suggest' }] },
  ] },
  { id: 'verification', title: 'Verificação', description: 'Cheque precisão, links e executabilidade.', specialist: 'qa_engineer', fields: [
    { id: 'verification_notes', label: 'Resultado da verificação', type: 'textarea', required: true, aiActions: [{ id: 'review', label: 'Revisar documentação', prompt: 'Revise {{draft}} contra {{sources}}: fatos sem fonte, passos ambíguos, pré-requisitos e links a validar.', insertMode: 'suggest' }] },
  ] },
  { id: 'publish', title: 'Publicação e manutenção', description: 'Defina formato, dono e atualização.', specialist: 'technical_writer', fields: [
    { id: 'maintenance', label: 'Plano de manutenção', type: 'textarea', aiActions: [{ id: 'generate', label: 'Gerar plano', prompt: 'Defina gatilhos de atualização, responsável pendente e revisão para esta documentação.', insertMode: 'suggest' }] },
  ] },
];

export const documentationCreateGenome: MissionGenome = {
  id: 'documentation.create', category: 'create', title: 'Criar documentação técnica',
  description: 'Produza documentação orientada a tarefas, baseada em fontes e fácil de manter.',
  icon: 'BookOpenText', estimatedTime: '20–50 min', complexity: 4,
  specialists: ['technical_writer', 'qa_engineer'], executionModes: ['guided', 'quick', 'collaborative', 'learning'],
  inputTypes: ['text', 'files', 'code', 'urls', 'schemas', 'project_ref'], steps, conditionalSteps: [], validations: [],
  gapRules: [{ id: 'missing_sources', check: (ctx) => !ctx.answers['sources.sources'], title: 'Fontes não informadas', severity: 'critical', suggestedAction: 'Adicione fontes verificáveis antes de gerar conteúdo.', relatedStepId: 'sources' }],
  riskRules: [{ id: 'draft_without_sources', check: (ctx) => Boolean(ctx.answers['content.draft']) && !ctx.answers['sources.sources'], severity: 'high', category: 'accuracy', title: 'Conteúdo sem fonte', description: 'O rascunho não possui base verificável registrada.', suggestedAction: 'Vincule fontes ou marque o conteúdo como pendente.', affectedSteps: ['sources', 'content'] }],
  artifacts: [{ type: 'documentation', title: 'Documentação Técnica', format: 'markdown' }],
  knowledgeTopics: ['docs_as_code', 'information_architecture', 'technical_review'], canReceiveFrom: ['software.build', 'project.analyze', 'architecture.review'],
};
