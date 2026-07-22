import type { MissionGenome, MissionStepDefinition } from '../../types';

function step(id: string, title: string, fieldLabel: string, promptVerb: string): MissionStepDefinition {
  return {
    id, title, description: '', specialist: 'automation_architect',
    fields: [{
      id: `${id}_notes`, label: fieldLabel, type: 'textarea', required: id === 'current_process' || id === 'trigger' || id === 'actions',
      aiActions: [{ id: 'generate', label: 'Gerar', insertMode: 'replace', prompt: `${promptVerb}. Processo: "{{current_process_notes}}". Objetivo: "{{automation_goal_notes}}".` }],
    }],
  };
}

const steps: MissionStepDefinition[] = [
  step('current_process', 'Processo atual', 'Como o processo funciona hoje, manualmente.', 'Descreva objetivamente o processo manual atual'),
  step('automation_goal', 'Objetivo da automação', 'O que deve ser alcançado ao automatizar.', 'Defina o objetivo desta automação'),
  step('trigger', 'Gatilho', 'O que inicia a automação.', 'Sugira gatilhos plausíveis para esta automação'),
  step('inputs_data', 'Entradas e dados', 'Quais dados a automação recebe.', 'Liste os dados de entrada necessários'),
  step('rules_conditions', 'Regras e condições', 'Lógica condicional do fluxo.', 'Gere as regras condicionais do fluxo'),
  step('actions', 'Ações', 'O que a automação executa.', 'Liste as ações que a automação deve executar'),
  step('branches', 'Ramificações', 'Caminhos alternativos do fluxo.', 'Sugira ramificações alternativas do fluxo'),
  step('integrations_credentials', 'Integrações e credenciais', 'Sistemas externos envolvidos.', 'Liste integrações externas necessárias'),
  step('error_handling_retries', 'Tratamento de erros e retentativas', 'O que acontece quando algo falha.', 'Defina o tratamento de erros e retentativas'),
  step('idempotency', 'Idempotência', 'Como evitar duplicidade de execução.', 'Sugira estratégia de idempotência'),
  step('logs_audit', 'Logs e auditoria', 'Rastreabilidade da automação.', 'Defina o que deve ser logado para auditoria'),
  step('human_approval', 'Aprovação humana', 'Onde há intervenção humana, se houver.', 'Identifique pontos que exigem aprovação humana'),
  { id: 'publish_monitor', title: 'Publicação e monitoramento', description: 'Como a automação é publicada e observada.', specialist: 'automation_architect', fields: [] },
];

export const automationCreateGenome: MissionGenome = {
  id: 'automation.create',
  category: 'create',
  title: 'Criar automação ou workflow',
  primaryActionLabel: 'Iniciar criação de automação',
  description: 'Da descrição do processo ao plano de automação: gatilho, ações, erros e publicação.',
  icon: 'Workflow',
  estimatedTime: '20–40 min',
  complexity: 5,
  specialists: ['automation_architect', 'integration_specialist'],
  executionModes: ['guided', 'quick', 'expert'],
  inputTypes: ['text', 'files'],
  steps,
  conditionalSteps: [],
  validations: [],
  gapRules: [
    {
      id: 'missing_error_handling', severity: 'critical', title: 'Tratamento de erros não definido',
      suggestedAction: 'Preencha a etapa "Tratamento de erros e retentativas".',
      check: (ctx) => !ctx.answers['error_handling_retries.error_handling_retries_notes'],
    },
    {
      id: 'missing_idempotency', severity: 'important', title: 'Idempotência não definida',
      suggestedAction: 'Preencha a etapa "Idempotência" para evitar execuções duplicadas.',
      check: (ctx) => !ctx.answers['idempotency.idempotency_notes'],
    },
  ],
  riskRules: [],
  artifacts: [{ type: 'workflow', title: 'Plano de Automação', format: 'markdown', canFeedMission: [] }],
  knowledgeTopics: ['trigger_types', 'error_handling_patterns'],
};
