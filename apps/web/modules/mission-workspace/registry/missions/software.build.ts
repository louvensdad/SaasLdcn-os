import type { ConditionalStepDefinition, GapRule, MissionGenome, MissionStepDefinition, RiskRule } from '../../types';

const steps: MissionStepDefinition[] = [
  {
    id: 'vision',
    title: 'Visão do produto',
    description: 'O que você está construindo e para quem.',
    specialist: 'software_architect',
    fields: [
      { id: 'project_name', label: 'Nome do projeto', type: 'text', placeholder: 'Ex: Acme ERP', required: true, aiActions: [] },
      {
        id: 'system_type', label: 'Tipo de sistema', type: 'select', required: true,
        options: ['ERP', 'CRM', 'Marketplace', 'SaaS', 'Sistema interno', 'Plataforma educacional', 'Sistema financeiro', 'Sistema de saúde', 'Outro'],
        aiActions: [
          { id: 'suggest_type', label: 'Sugerir com base na descrição', insertMode: 'suggest',
            prompt: 'Com base na descrição do projeto "{{vision_description}}", qual tipo de sistema é mais adequado? Responda com uma das opções disponíveis e explique em uma linha.' },
        ],
      },
      {
        id: 'vision_description', label: 'Descreva o sistema em uma vez', type: 'textarea', required: true,
        description: 'Descreva o problema que resolve, quem usa e o que entrega.',
        aiActions: [
          { id: 'improve', label: 'Melhorar', insertMode: 'replace',
            prompt: 'Melhore esta descrição de sistema tornando-a mais clara e completa, mantendo a voz original: "{{vision_description}}"' },
          { id: 'extract_requirements', label: 'Extrair requisitos', insertMode: 'suggest',
            prompt: 'Extraia os requisitos funcionais implícitos desta descrição: "{{vision_description}}". Liste de forma estruturada.' },
        ],
      },
      {
        id: 'problem', label: 'Qual problema resolve?', type: 'textarea', required: true,
        aiActions: [
          { id: 'generate', label: 'Gerar com base na visão', insertMode: 'replace',
            prompt: 'Com base na descrição "{{vision_description}}", escreva o problema de negócio que este sistema resolve. Seja específico e objetivo.' },
        ],
      },
    ],
  },
  {
    id: 'users',
    title: 'Usuários e permissões',
    description: 'Quem usa o sistema e o que cada perfil pode fazer.',
    specialist: 'software_architect',
    fields: [
      {
        id: 'user_types', label: 'Tipos de usuário', type: 'chips', required: true,
        aiActions: [
          { id: 'suggest_users', label: 'Sugerir perfis', insertMode: 'suggest',
            prompt: 'Para um sistema do tipo "{{system_type}}" chamado "{{project_name}}", quais perfis de usuário são típicos? Liste apenas os nomes dos perfis.' },
        ],
      },
      {
        id: 'permission_matrix', label: 'O que cada perfil pode fazer?', type: 'textarea',
        aiActions: [
          { id: 'generate_matrix', label: 'Gerar matriz de permissões', insertMode: 'replace',
            prompt: 'Para os perfis "{{user_types}}" de um sistema "{{system_type}}", gere uma matriz de permissões básica. Formato: Perfil → O que pode fazer.' },
        ],
      },
    ],
  },
  {
    id: 'business_rules',
    title: 'Regras de negócio',
    description: 'As decisões e restrições que governam o sistema.',
    specialist: 'software_architect',
    fields: [
      {
        id: 'main_rules', label: 'Principais regras de negócio', type: 'textarea', required: true,
        description: 'Uma por linha.',
        aiActions: [
          { id: 'generate', label: 'Gerar', insertMode: 'replace',
            prompt: 'Gere as principais regras de negócio para um sistema {{system_type}} com a seguinte descrição: "{{vision_description}}". Uma regra por linha, começando com verbo.' },
          { id: 'find_ambiguities', label: 'Encontrar ambiguidades', insertMode: 'suggest',
            prompt: 'Analise estas regras de negócio e identifique ambiguidades, contradições ou lacunas: "{{main_rules}}"' },
          { id: 'to_acceptance_criteria', label: '→ Critérios de aceite', insertMode: 'suggest',
            prompt: 'Transforme estas regras de negócio em critérios de aceitação no formato Dado/Quando/Então: "{{main_rules}}"' },
          { id: 'generate_tests', label: '→ Casos de teste', insertMode: 'suggest',
            prompt: 'Gere casos de teste baseados nestas regras de negócio: "{{main_rules}}"' },
        ],
      },
      {
        id: 'operational_flows', label: 'Fluxos operacionais', type: 'textarea',
        description: 'Como os processos principais funcionam.',
        aiActions: [
          { id: 'generate', label: 'Gerar', insertMode: 'replace',
            prompt: 'Descreva os fluxos operacionais principais de um sistema {{system_type}} com base nas regras: "{{main_rules}}"' },
        ],
      },
    ],
  },
  {
    id: 'technology',
    title: 'Linguagem e ecossistema',
    description: 'A stack que vai sustentar o sistema.',
    specialist: 'backend_engineer',
    fields: [
      {
        id: 'language', label: 'Linguagem principal', type: 'select', required: true,
        options: ['Java', 'Python', 'TypeScript', 'JavaScript', 'Go', 'C#', 'PHP', 'Kotlin', 'Dart', 'Rust', 'Ruby', 'Swift', 'Scala', 'Outro'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar', insertMode: 'suggest',
            prompt: 'Considerando um sistema "{{system_type}}" com complexidade estimada {{complexity}}, equipe de nível {{experience_level}}, qual linguagem de programação recomenda e por quê? Seja direto.' },
        ],
      },
      {
        id: 'framework', label: 'Framework principal', type: 'select',
        dependsOn: { fieldId: 'language', value: 'Java' },
        aiActions: [
          { id: 'list_options', label: 'Ver opções para {{language}}', insertMode: 'suggest',
            prompt: 'Liste os principais frameworks para {{language}} adequados para um sistema {{system_type}}, com uma linha de comparação entre eles.' },
          { id: 'compare', label: 'Comparar frameworks', insertMode: 'suggest',
            prompt: 'Compare os principais frameworks de {{language}} em: curva de aprendizado, produtividade, performance, maturidade, adequação para {{system_type}}. Recomende um para este projeto.' },
        ],
      },
      {
        id: 'database', label: 'Banco de dados', type: 'multiselect',
        aiActions: [
          { id: 'recommend', label: 'Recomendar', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com as regras "{{main_rules}}" e entidades mencionadas, qual banco de dados (ou combinação) recomenda? Justifique.' },
        ],
      },
      {
        id: 'additional_services', label: 'Serviços adicionais', type: 'chips',
        description: 'Cache, filas, storage, CDN, etc.',
        aiActions: [
          { id: 'suggest', label: 'Sugerir', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com as capacidades descritas, quais serviços de infraestrutura adicionais (cache, filas, storage, etc.) são necessários ou recomendados?' },
        ],
      },
    ],
  },
  {
    id: 'architecture',
    title: 'Arquitetura',
    description: 'Como o sistema é organizado internamente.',
    specialist: 'software_architect',
    fields: [
      {
        id: 'architecture_style', label: 'Estilo arquitetural', type: 'select',
        options: ['Monólito', 'Monólito modular', 'Microserviços', 'Event-driven', 'Serverless', 'Hexagonal', 'Clean Architecture', 'Layered', 'CQRS', 'Outro'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar com justificativa', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com complexidade {{complexity}}/10, prazo estimado {{timeline}}, equipe de nível {{experience_level}}, qual estilo arquitetural recomenda? Mostre vantagens, riscos e por que é adequado para este contexto específico.' },
        ],
      },
      {
        id: 'modules', label: 'Módulos principais', type: 'chips',
        description: 'As grandes áreas funcionais do sistema.',
        aiActions: [
          { id: 'suggest', label: 'Sugerir módulos', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com as capacidades descritas nas regras de negócio "{{main_rules}}", sugira os módulos principais. Liste apenas os nomes.' },
          { id: 'detect_missing', label: 'Detectar lacunas', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com os módulos "{{modules}}", que capacidades importantes podem estar faltando? Considere: autenticação, autorização, auditoria, notificações, relatórios, integrações típicas.' },
        ],
      },
    ],
  },
  {
    id: 'data_model',
    title: 'Modelo de dados',
    description: 'Entidades, relacionamentos e restrições.',
    specialist: 'database_engineer',
    fields: [
      {
        id: 'entities', label: 'Entidades e relacionamentos', type: 'entity-editor',
        aiActions: [
          { id: 'suggest_entities', label: 'Sugerir entidades', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com módulos "{{modules}}" e regras "{{main_rules}}", sugira as entidades principais com seus atributos essenciais e relacionamentos.' },
          { id: 'detect_issues', label: 'Detectar problemas', insertMode: 'suggest',
            prompt: 'Analise este modelo de dados e detecte: duplicações, ausência de índices, dados sensíveis sem política, entidades sem auditoria, relacionamentos inconsistentes: "{{entities}}"' },
          { id: 'lgpd_check', label: 'Verificar LGPD', insertMode: 'suggest',
            prompt: 'Identifique neste modelo quais campos contêm dados pessoais ou sensíveis conforme LGPD. Sugira políticas de proteção para cada um: "{{entities}}"' },
        ],
      },
      {
        id: 'restrictions', label: 'Restrições e regras de dados', type: 'textarea',
        aiActions: [
          { id: 'generate', label: 'Gerar a partir das regras', insertMode: 'replace',
            prompt: 'Com base nas regras de negócio "{{main_rules}}" e entidades "{{entities}}", quais restrições de dados (constraints, validações, unicidade, etc.) são necessárias?' },
        ],
      },
    ],
  },
  {
    id: 'apis',
    title: 'APIs e integrações',
    description: 'Contratos, endpoints e sistemas externos.',
    specialist: 'backend_engineer',
    fields: [
      {
        id: 'api_style', label: 'Estilo de API', type: 'select',
        options: ['REST', 'GraphQL', 'gRPC', 'WebSocket', 'REST + WebSocket', 'Outro'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com os clientes descritos ({{user_types}}) e necessidades de tempo real detectadas, qual estilo de API é mais adequado? Justifique.' },
        ],
      },
      {
        id: 'main_endpoints', label: 'Endpoints principais', type: 'textarea',
        aiActions: [
          { id: 'generate', label: 'Gerar endpoints', insertMode: 'replace',
            prompt: 'Para os módulos "{{modules}}" e entidades "{{entities}}" de um sistema {{system_type}} {{api_style}}, gere os endpoints principais. Formato: MÉTODO /rota — descrição breve.' },
          { id: 'check_auth', label: 'Verificar autenticação', insertMode: 'suggest',
            prompt: 'Analise estes endpoints e identifique quais precisam de autenticação, quais precisam de autorização por perfil, e quais estão potencialmente expostos sem proteção: "{{main_endpoints}}"' },
        ],
      },
      {
        id: 'external_integrations', label: 'Integrações externas', type: 'textarea',
        aiActions: [
          { id: 'suggest', label: 'Sugerir integrações típicas', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com os módulos "{{modules}}", quais integrações externas são tipicamente necessárias? (pagamentos, notificações, storage, auth, etc.)' },
        ],
      },
    ],
  },
  {
    id: 'security',
    title: 'Segurança',
    description: 'Autenticação, autorização, dados sensíveis e riscos.',
    specialist: 'security_engineer',
    fields: [
      {
        id: 'auth_strategy', label: 'Estratégia de autenticação', type: 'select',
        options: ['JWT', 'OAuth 2.0', 'Session-based', 'API Key', 'SSO/SAML', 'Magic Link', 'Multi-factor', 'Combinação'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com os perfis "{{user_types}}", qual estratégia de autenticação é mais adequada? Considere segurança, UX e complexidade de implementação.' },
        ],
      },
      {
        id: 'security_concerns', label: 'Preocupações de segurança específicas', type: 'chips',
        aiActions: [
          { id: 'analyze', label: 'Analisar riscos do projeto', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com dados {{entities}}, integrações {{external_integrations}}, quais são os principais riscos de segurança (OWASP, LGPD, infraestrutura)? Liste de forma concisa.' },
        ],
      },
    ],
  },
  {
    id: 'testing',
    title: 'Testes e qualidade',
    description: 'Estratégia de testes e critérios de qualidade.',
    specialist: 'qa_engineer',
    fields: [
      {
        id: 'test_strategy', label: 'Estratégia de testes', type: 'multiselect',
        options: ['Unitários', 'Integração', 'Contrato', 'E2E', 'Performance', 'Segurança', 'Regressão', 'Smoke'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar estratégia', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com arquitetura {{architecture_style}} em {{language}}, qual estratégia de testes é mais adequada? Qual o mix recomendado e por quê?' },
        ],
      },
      {
        id: 'test_tools', label: 'Ferramentas de teste', type: 'textarea',
        aiActions: [
          { id: 'suggest', label: 'Sugerir ferramentas', insertMode: 'replace',
            prompt: 'Para {{language}} + {{framework}} com a estratégia "{{test_strategy}}", quais ferramentas de teste recomenda? Liste com uma linha de justificativa cada.' },
        ],
      },
    ],
  },
  {
    id: 'infrastructure',
    title: 'Infraestrutura e deploy',
    description: 'Onde e como o sistema vai rodar.',
    specialist: 'devops_engineer',
    fields: [
      { id: 'infrastructure_type', label: 'Tipo de infraestrutura', type: 'select',
        options: ['Cloud (AWS)', 'Cloud (GCP)', 'Cloud (Azure)', 'VPS', 'Serverless', 'On-premise', 'Híbrido'], aiActions: [] },
      {
        id: 'containerization', label: 'Containerização', type: 'select',
        options: ['Docker + Docker Compose', 'Docker + Kubernetes', 'Apenas Docker', 'Sem container', 'Serverless'],
        aiActions: [
          { id: 'recommend', label: 'Recomendar', insertMode: 'suggest',
            prompt: 'Para um sistema {{system_type}} com arquitetura {{architecture_style}} em {{infrastructure_type}}, qual abordagem de containerização é adequada?' },
        ],
      },
      { id: 'cicd', label: 'CI/CD', type: 'select', options: ['GitHub Actions', 'GitLab CI', 'Jenkins', 'CircleCI', 'Azure DevOps', 'Outro', 'Não definido'], aiActions: [] },
      { id: 'environments', label: 'Ambientes', type: 'chips', aiActions: [] },
    ],
  },
  {
    id: 'blueprint',
    title: 'Blueprint final',
    description: 'Revisão completa e geração dos entregáveis.',
    specialist: 'software_architect',
    fields: [],
  },
];

const conditionalSteps: ConditionalStepDefinition[] = [
  {
    id: 'observability',
    title: 'Observabilidade',
    insertAfter: 'infrastructure',
    condition: (ctx) => {
      const arch = ctx.answers['architecture.architecture_style'];
      return arch === 'Microserviços' || arch === 'Event-driven';
    },
  },
  {
    id: 'lgpd_compliance',
    title: 'Conformidade LGPD',
    insertAfter: 'security',
    condition: (ctx) => ctx.risks.some((risk) => risk.category === 'data_privacy'),
  },
  {
    id: 'payments_details',
    title: 'Pagamentos e compliance financeiro',
    insertAfter: 'security',
    condition: (ctx) => {
      const modules = (ctx.answers['architecture.modules'] as string[] | undefined) ?? [];
      return modules.some((module) => module.toLowerCase().includes('pagamento') || module.toLowerCase().includes('financeiro'));
    },
  },
];

const gapRules: GapRule[] = [
  {
    id: 'missing_auth', severity: 'critical', title: 'Autenticação não definida',
    suggestedAction: 'Defina a estratégia de autenticação na etapa de Segurança.',
    check: (ctx) => !ctx.answers['security.auth_strategy'],
  },
  {
    id: 'missing_error_handling', severity: 'important', title: 'Tratamento de erros não definido',
    suggestedAction: 'Defina como erros e exceções serão tratados nas APIs.',
    check: (ctx) => !ctx.answers['apis.error_strategy'],
  },
  {
    id: 'marketplace_missing_modules', severity: 'important', title: 'Módulos típicos de Marketplace não cobertos',
    suggestedAction: 'Revise os módulos para incluir os componentes essenciais de um marketplace.',
    check: (ctx) => {
      if (ctx.answers['vision.system_type'] !== 'Marketplace') return false;
      const modules = ((ctx.answers['architecture.modules'] as string[] | undefined) ?? []).map((m) => m.toLowerCase());
      const required = ['vendedores', 'compradores', 'pedidos', 'pagamentos', 'comissões'];
      return required.some((keyword) => !modules.some((m) => m.includes(keyword)));
    },
  },
];

const riskRules: RiskRule[] = [
  {
    id: 'microservices_small_project', severity: 'high', category: 'architecture',
    title: 'Microserviços para projeto de baixa complexidade',
    description: 'Microserviços adicionam sobrecarga operacional significativa. Para este projeto, um monólito modular pode ser mais adequado.',
    suggestedAction: 'Revise a arquitetura na etapa correspondente.',
    check: (ctx) => {
      const arch = ctx.answers['architecture.architecture_style'];
      // No separate "derived complexity" bag in this build -- module count is
      // a reasonable, real proxy for project size instead.
      const moduleCount = ((ctx.answers['architecture.modules'] as string[] | undefined) ?? []).length;
      return arch === 'Microserviços' && moduleCount > 0 && moduleCount < 4;
    },
  },
  {
    id: 'sensitive_data_no_encryption', severity: 'critical', category: 'security',
    title: 'Dados sensíveis sem política de criptografia',
    description: 'Foram detectados dados pessoais ou sensíveis sem definição de criptografia.',
    suggestedAction: 'Defina a estratégia de criptografia na etapa de Segurança.',
    check: (ctx) => {
      const hasSensitiveData = ctx.risks.some((risk) => risk.category === 'data_privacy');
      return hasSensitiveData && !ctx.answers['security.encryption_defined'];
    },
  },
];

export const softwareBuildGenome: MissionGenome = {
  id: 'software.build',
  category: 'create',
  title: 'Criar software',
  primaryActionLabel: 'Iniciar criação de software',
  description: 'Planeje, modele e prepare um sistema do zero — app, API, plataforma ou serviço.',
  icon: 'Blocks',
  estimatedTime: '30–90 min',
  complexity: 8,
  specialists: ['software_architect', 'backend_engineer', 'database_engineer', 'security_engineer', 'qa_engineer', 'devops_engineer'],
  executionModes: ['guided', 'quick', 'expert'],
  inputTypes: ['text', 'files', 'urls', 'schemas', 'project_ref'],
  steps,
  conditionalSteps,
  validations: [],
  gapRules,
  riskRules,
  artifacts: [
    { type: 'blueprint', title: 'Blueprint do Sistema', format: 'markdown', canFeedMission: ['project.plan', 'architecture.review'] },
    { type: 'prompt_md', title: 'Prompt.md', format: 'markdown', canFeedMission: [] },
    { type: 'architecture', title: 'Documento de Arquitetura', format: 'markdown', canFeedMission: ['architecture.review'] },
    { type: 'data_model', title: 'Modelo de Dados', format: 'markdown', canFeedMission: ['project.analyze'] },
    { type: 'api_contracts', title: 'Contratos de API', format: 'markdown', canFeedMission: [] },
    { type: 'test_plan', title: 'Plano de Testes', format: 'markdown', canFeedMission: [] },
    { type: 'deploy_plan', title: 'Plano de Deploy', format: 'markdown', canFeedMission: ['deploy.plan'] },
  ],
  knowledgeTopics: ['stack_guide', 'architecture_patterns', 'security_checklist', 'testing_strategy', 'deploy_options'],
};
