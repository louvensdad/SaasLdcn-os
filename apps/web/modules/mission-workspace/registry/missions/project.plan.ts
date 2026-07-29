import type { MissionGenome, MissionStepDefinition } from '../../types';

const steps: readonly MissionStepDefinition[] = [
  { id: 'outcome', title: 'Resultado esperado', description: 'Defina o valor, o público e o critério de sucesso.', specialist: 'product_strategist', fields: [
    { id: 'objective', label: 'Objetivo do projeto', type: 'textarea', required: true, aiActions: [{ id: 'clarify', label: 'Tornar objetivo mensurável', prompt: 'Reescreva o objetivo {{objective}} como resultado mensurável. Não invente métricas ausentes; marque-as como pendentes.', insertMode: 'suggest' }] },
    { id: 'success_metrics', label: 'Métricas de sucesso', type: 'chips', required: true, aiActions: [{ id: 'suggest', label: 'Sugerir métricas', prompt: 'Sugira métricas verificáveis para {{objective}}, separando suposições de fatos.', insertMode: 'suggest' }] },
  ] },
  { id: 'scope', title: 'Escopo', description: 'Delimite entregas, exclusões e restrições.', specialist: 'product_strategist', fields: [
    { id: 'deliverables', label: 'Entregas', type: 'textarea', required: true, aiActions: [{ id: 'structure', label: 'Estruturar entregas', prompt: 'Estruture estas entregas em resultados verificáveis: {{deliverables}}.', insertMode: 'suggest' }] },
    { id: 'out_of_scope', label: 'Fora do escopo', type: 'textarea', aiActions: [] },
    { id: 'constraints', label: 'Restrições', type: 'textarea', aiActions: [] },
  ] },
  { id: 'stakeholders', title: 'Pessoas e responsabilidades', description: 'Mapeie participantes, decisões e disponibilidade.', specialist: 'product_strategist', fields: [
    { id: 'roles', label: 'Papéis envolvidos', type: 'chips', required: true, aiActions: [{ id: 'suggest', label: 'Sugerir papéis', prompt: 'Para o objetivo {{objective}} e entregas {{deliverables}}, sugira papéis necessários e deixe responsáveis não informados como pendentes.', insertMode: 'suggest' }] },
  ] },
  { id: 'roadmap', title: 'Roadmap e marcos', description: 'Organize o caminho de entrega.', specialist: 'risk_analyst', fields: [
    { id: 'milestones', label: 'Marcos', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar roadmap', prompt: 'Crie marcos ordenados para {{deliverables}} considerando estas restrições: {{constraints}}. Não invente datas.', insertMode: 'suggest' }] },
  ] },
  { id: 'risks', title: 'Riscos e dependências', description: 'Antecipe bloqueios e respostas.', specialist: 'risk_analyst', fields: [
    { id: 'risk_register', label: 'Registro de riscos', type: 'textarea', aiActions: [{ id: 'analyze', label: 'Analisar riscos', prompt: 'Identifique riscos, sinais, impacto e mitigação para o roadmap {{milestones}}.', insertMode: 'suggest' }] },
    { id: 'dependencies', label: 'Dependências', type: 'chips', aiActions: [] },
  ] },
  { id: 'execution', title: 'Plano de execução', description: 'Consolide próximos passos e cadência.', specialist: 'product_strategist', fields: [
    { id: 'first_actions', label: 'Próximas ações', type: 'textarea', required: true, aiActions: [{ id: 'generate', label: 'Gerar plano de ação', prompt: 'Transforme os marcos {{milestones}} em próximas ações com responsável pendente quando ausente.', insertMode: 'suggest' }] },
  ] },
];

export const projectPlanGenome: MissionGenome = {
  id: 'project.plan', category: 'plan', title: 'Planejar projeto e roadmap',
  description: 'Transforme um objetivo em escopo, marcos, riscos e um plano de execução verificável.',
  icon: 'Map', estimatedTime: '20–45 min', complexity: 5,
  specialists: ['product_strategist', 'risk_analyst'], executionModes: ['guided', 'quick', 'collaborative', 'learning'],
  inputTypes: ['text', 'files', 'project_ref'], steps, conditionalSteps: [], validations: [],
  gapRules: [{ id: 'missing_success_metrics', check: (ctx) => !ctx.answers['outcome.success_metrics'], title: 'Métricas de sucesso pendentes', severity: 'important', suggestedAction: 'Defina como o resultado será medido.', relatedStepId: 'outcome' }],
  riskRules: [{ id: 'roadmap_without_dependencies', check: (ctx) => Boolean(ctx.answers['roadmap.milestones']) && !ctx.answers['risks.dependencies'], severity: 'medium', category: 'planning', title: 'Roadmap sem dependências mapeadas', description: 'Marcos podem depender de times, fornecedores ou decisões ainda não registrados.', suggestedAction: 'Mapeie dependências antes de comprometer datas.', affectedSteps: ['roadmap', 'risks'] }],
  artifacts: [{ type: 'roadmap', title: 'Roadmap do Projeto', format: 'markdown', canFeedMission: ['software.build'] }, { type: 'backlog', title: 'Backlog Inicial', format: 'markdown' }],
  knowledgeTopics: ['project_scoping', 'roadmap_patterns', 'risk_management'], canFeedInto: ['software.build'],
};
