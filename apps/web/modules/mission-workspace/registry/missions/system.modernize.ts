import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: readonly MissionStepDefinition[] = [
  { id: 'baseline', title: 'Baseline do legado', description: 'Documente stack, limites e operação atual.', specialist: 'software_architect', fields: [
    { id: 'current_stack', label: 'Stack atual', type: 'textarea', required: true, aiActions: [] },
    { id: 'pain_points', label: 'Problemas observados', type: 'textarea', required: true, aiActions: [{ id: 'classify', label: 'Classificar problemas', prompt: 'Classifique {{pain_points}} em risco, custo, velocidade, segurança e operação, sem inventar causa.', insertMode: 'suggest' }] },
  ] },
  { id: 'drivers', title: 'Motivadores e restrições', description: 'Explique por que modernizar e o que não pode quebrar.', specialist: 'risk_analyst', fields: [
    { id: 'drivers', label: 'Motivadores', type: 'chips', required: true, aiActions: [] },
    { id: 'constraints', label: 'Restrições e invariantes', type: 'textarea', required: true, aiActions: [] },
  ] },
  { id: 'target', title: 'Estado alvo', description: 'Defina capacidades e arquitetura desejadas.', specialist: 'software_architect', fields: [
    { id: 'target_state', label: 'Estado alvo', type: 'textarea', required: true, aiActions: [{ id: 'propose', label: 'Propor estado alvo', prompt: 'Proponha um estado alvo para {{current_stack}} guiado por {{drivers}} e respeitando {{constraints}}. Mostre trade-offs.', insertMode: 'suggest' }] },
  ] },
  { id: 'strategy', title: 'Estratégia de migração', description: 'Escolha uma transição reversível.', specialist: 'devops_engineer', fields: [
    { id: 'migration_strategy', label: 'Estratégia', type: 'select', options: ['Strangler', 'Migração incremental', 'Replatform', 'Refatoração em módulos', 'Substituição controlada', 'Pendente'], required: true, aiActions: [{ id: 'recommend', label: 'Recomendar estratégia', prompt: 'Compare estratégias para ir de {{current_stack}} a {{target_state}} sob {{constraints}}.', insertMode: 'suggest' }] },
    { id: 'rollback', label: 'Estratégia de rollback', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar rollback', prompt: 'Defina critérios e passos de rollback para {{migration_strategy}}. Não presuma infraestrutura ausente.', insertMode: 'suggest' }] },
  ] },
  { id: 'waves', title: 'Ondas de execução', description: 'Ordene migração, validação e desativação.', specialist: 'devops_engineer', fields: [
    { id: 'waves', label: 'Plano em ondas', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar ondas', prompt: 'Crie ondas incrementais para {{migration_strategy}} com validação e rollback em cada onda.', insertMode: 'suggest' }] },
  ] },
  { id: 'validation', title: 'Validação e cutover', description: 'Defina evidências para avançar.', specialist: 'qa_engineer', fields: [
    { id: 'validation_plan', label: 'Plano de validação', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar validação', prompt: 'Gere gates funcionais, dados, performance e segurança para as ondas {{waves}}.', insertMode: 'suggest' }] },
  ] },
];

export const systemModernizeGenome: MissionGenome = {
  id: 'system.modernize', category: 'evolve', title: 'Modernizar sistema legado',
  description: 'Planeje uma evolução incremental, rastreável e reversível do estado atual ao estado alvo.',
  icon: 'RefreshCw', estimatedTime: '35–90 min', complexity: 8,
  specialists: ['software_architect', 'devops_engineer', 'risk_analyst', 'qa_engineer'],
  executionModes: ['guided', 'analysis', 'expert', 'collaborative'], inputTypes: ['text', 'files', 'code', 'logs', 'schemas', 'project_ref'],
  steps, conditionalSteps: [], validations: [],
  gapRules: [{ id: 'missing_rollback', check: (ctx) => !ctx.answers['strategy.rollback'], title: 'Rollback não definido', severity: 'critical', suggestedAction: 'Defina como interromper e reverter cada onda.', relatedStepId: 'strategy' }],
  riskRules: [{ id: 'big_bang', check: (ctx) => ctx.answers['strategy.migration_strategy'] === 'Substituição controlada' && !ctx.answers['strategy.rollback'], severity: 'critical', category: 'migration', title: 'Substituição sem rollback', description: 'Uma troca ampla sem reversão aumenta o risco operacional.', suggestedAction: 'Defina rollback ou adote migração incremental.', affectedSteps: ['strategy', 'waves'] }],
  artifacts: [{ type: 'migration_plan', title: 'Plano de Modernização', format: 'markdown' }, { type: 'roadmap', title: 'Roadmap de Migração', format: 'markdown' }, { type: 'test_plan', title: 'Plano de Validação', format: 'markdown' }],
  knowledgeTopics: ['modernization_patterns', 'strangler_pattern', 'migration_safety'], canReceiveFrom: ['architecture.review', 'project.analyze'],
};
