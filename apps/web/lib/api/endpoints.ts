// NOTE: must share a "site" (registrable domain) with the frontend origin
// (e.g. http://localhost:3000) so the SameSite=Lax refresh-token cookie set
// by the API is actually sent back on subsequent requests. 127.0.0.1 and
// localhost are treated as different sites by browsers.
const DEFAULT_API_URL = 'http://localhost:8001';

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL;

export const apiEndpoints = {
  health: `${API_BASE_URL}/api/health`,
  auth: {
    register: `${API_BASE_URL}/api/auth/register`,
    login: `${API_BASE_URL}/api/auth/login`,
    refresh: `${API_BASE_URL}/api/auth/refresh`,
    logout: `${API_BASE_URL}/api/auth/logout`,
    me: `${API_BASE_URL}/api/auth/me`,
    changePassword: `${API_BASE_URL}/api/auth/me/password`,
    consent: `${API_BASE_URL}/api/auth/me/consent`,
    exportData: `${API_BASE_URL}/api/auth/me/export`,
    // Full-page redirect (not a fetch): the backend redirects on to the
    // provider's consent screen, then back to /login with the refresh
    // cookie already set.
    oauthStart: (provider: 'google' | 'github') => `${API_BASE_URL}/api/auth/oauth/${provider}/start`,
  },
  localization: {
    locales: `${API_BASE_URL}/api/localization/locales`,
    dictionary: (locale: string) => `${API_BASE_URL}/api/localization/dictionary/${locale}`,
    preview: `${API_BASE_URL}/api/localization/preview`,
    validate: `${API_BASE_URL}/api/localization/validate`,
  },
  stacks: `${API_BASE_URL}/api/stacks`,
  templates: `${API_BASE_URL}/api/templates`,
  skills: `${API_BASE_URL}/api/skills`,
  skillCategories: `${API_BASE_URL}/api/skills/categories`,
  skillRecommended: (params: URLSearchParams) => `${API_BASE_URL}/api/skills/recommended?${params.toString()}`,
  skillPreview: `${API_BASE_URL}/api/skills/preview`,
  skill: (skillId: string) => `${API_BASE_URL}/api/skills/${skillId}`,
  systemStatus: `${API_BASE_URL}/api/system-status`,
  roadmap: `${API_BASE_URL}/api/roadmap`,
  templateCatalog: `${API_BASE_URL}/api/templates/catalog`,
  templateCategories: `${API_BASE_URL}/api/templates/categories`,
  template: (templateId: string) => `${API_BASE_URL}/api/templates/${templateId}`,
  templateCompatibility: (templateId: string, params: URLSearchParams) =>
    `${API_BASE_URL}/api/templates/${templateId}/compatibility?${params.toString()}`,
  templateRecommended: (params: URLSearchParams) => `${API_BASE_URL}/api/templates/recommended?${params.toString()}`,
  projects: `${API_BASE_URL}/api/projects`,
  project: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}`,
  downloads: `${API_BASE_URL}/api/downloads`,
  blueprints: {
    preview: `${API_BASE_URL}/api/blueprints/preview`,
  },
  promptMaster: {
    preview: `${API_BASE_URL}/api/prompt-master/preview`,
  },
  gatekeeper: {
    preview: `${API_BASE_URL}/api/gatekeeper/preview`,
  },
  generationHandoff: {
    preview: `${API_BASE_URL}/api/generation/handoff-preview`,
  },
  backendGeneration: {
    preview: `${API_BASE_URL}/api/backend-generation/preview`,
    run: `${API_BASE_URL}/api/backend-generation/run`,
    templates: `${API_BASE_URL}/api/backend-generation/templates`,
    status: (generationId: string) => `${API_BASE_URL}/api/backend-generation/status/${generationId}`,
  },
  localGeneration: {
    run: `${API_BASE_URL}/api/generation/local-run`,
    files: (projectId: string) => `${API_BASE_URL}/api/generation/${projectId}/files`,
    fileContent: (projectId: string, path: string) =>
      `${API_BASE_URL}/api/generation/${projectId}/file-content?path=${encodeURIComponent(path)}`,
    prepareDownload: (projectId: string) => `${API_BASE_URL}/api/generation/${projectId}/prepare-download`,
    download: (projectId: string) => `${API_BASE_URL}/api/generation/${projectId}/download`,
  },
  generatedProjectQuality: {
    run: (projectId: string) => `${API_BASE_URL}/api/generated-projects/${projectId}/quality-check`,
  },
  documentation: {
    library: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/documentation`,
    export: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/documentation/export`,
    generate: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/documentation/generate`,
    save: (projectId: string) => `${API_BASE_URL}/api/projects/${projectId}/documentation/save`,
  },
  gitExport: {
    preview: `${API_BASE_URL}/api/git/export/preview`,
    github: `${API_BASE_URL}/api/git/export/github`,
    gitlab: `${API_BASE_URL}/api/git/export/gitlab`,
    status: (exportId: string) => `${API_BASE_URL}/api/git/export/status/${exportId}`,
  },
  gitProviders: {
    connection: (provider: 'github' | 'gitlab') => `${API_BASE_URL}/api/integrations/git/${provider}`,
    connect: (provider: 'github' | 'gitlab') => `${API_BASE_URL}/api/integrations/git/${provider}/connect`,
    validate: (provider: 'github' | 'gitlab') => `${API_BASE_URL}/api/integrations/git/${provider}/validate`,
    repositories: `${API_BASE_URL}/api/repositories`,
  },
  projectRegistry: {
    saveFromWizard: `${API_BASE_URL}/api/projects/save-from-wizard`,
  },
  registry: {
    stacks: `${API_BASE_URL}/api/registry/stacks`,
    languages: `${API_BASE_URL}/api/registry/languages`,
    runtimes: `${API_BASE_URL}/api/registry/runtimes`,
    frameworks: `${API_BASE_URL}/api/registry/frameworks`,
    architectures: `${API_BASE_URL}/api/registry/architectures`,
    archetypes: `${API_BASE_URL}/api/registry/archetypes`,
    capabilities: `${API_BASE_URL}/api/registry/capabilities`,
    businessModules: `${API_BASE_URL}/api/registry/business-modules`,
    endpoints: `${API_BASE_URL}/api/registry/endpoints`,
    compatibility: `${API_BASE_URL}/api/registry/compatibility`,
    validateSelection: `${API_BASE_URL}/api/registry/validate-selection`,
    archetype: (archetypeId: string) => `${API_BASE_URL}/api/registry/archetypes/${archetypeId}`,
    languageFrameworks: (languageId: string) => `${API_BASE_URL}/api/registry/languages/${languageId}/frameworks`,
    framework: (frameworkId: string) => `${API_BASE_URL}/api/registry/frameworks/${frameworkId}`,
    frameworkArchitectures: (frameworkId: string) => `${API_BASE_URL}/api/registry/frameworks/${frameworkId}/architectures`,
    frameworkArchetypes: (frameworkId: string) => `${API_BASE_URL}/api/registry/frameworks/${frameworkId}/archetypes`,
    stackArchetypes: (stackId: string) => `${API_BASE_URL}/api/registry/stacks/${stackId}/archetypes`,
    stackCapabilities: (stackId: string) => `${API_BASE_URL}/api/registry/stacks/${stackId}/capabilities`,
    moduleEndpoints: (moduleId: string) => `${API_BASE_URL}/api/registry/business-modules/${moduleId}/endpoints`,
  },
  infrastructure: {
    components: `${API_BASE_URL}/api/infrastructure/components`,
    categories: `${API_BASE_URL}/api/infrastructure/categories`,
    component: (componentId: string) => `${API_BASE_URL}/api/infrastructure/components/${componentId}`,
    recommendations: `${API_BASE_URL}/api/infrastructure/recommendations`,
  },
  dependencyGraph: {
    preview: `${API_BASE_URL}/api/dependency-graph/preview`,
    impact: `${API_BASE_URL}/api/dependency-graph/impact`,
    readiness: `${API_BASE_URL}/api/dependency-graph/readiness`,
    risks: `${API_BASE_URL}/api/dependency-graph/risks`,
  },
  engineering: {
    readiness: `${API_BASE_URL}/api/engineering/readiness`,
    teamProfile: `${API_BASE_URL}/api/engineering/team-profile`,
    deliveryEstimate: `${API_BASE_URL}/api/engineering/delivery-estimate`,
    operationalBurden: `${API_BASE_URL}/api/engineering/operational-burden`,
  },
  systemDesign: {
    architectureTopology: `${API_BASE_URL}/api/system-design/architecture-topology`,
    infrastructureTopology: `${API_BASE_URL}/api/system-design/infrastructure-topology`,
    runtimeFlow: `${API_BASE_URL}/api/system-design/runtime-flow`,
    dependencyVisualization: `${API_BASE_URL}/api/system-design/dependency-visualization`,
    riskZones: `${API_BASE_URL}/api/system-design/risk-zones`,
    readinessZones: `${API_BASE_URL}/api/system-design/readiness-zones`,
    teamTopology: `${API_BASE_URL}/api/system-design/team-topology`,
    deploymentTopology: `${API_BASE_URL}/api/system-design/deployment-topology`,
    snapshot: `${API_BASE_URL}/api/system-design/snapshot`,
  },
  architecturalGraph: {
    preview: `${API_BASE_URL}/api/architectural-graph/preview`,
  },
  frameworkSpecialists: {
    profile: (frameworkId: string) => `${API_BASE_URL}/api/frameworks/${frameworkId}/specialist-profile`,
    architectures: (frameworkId: string) => `${API_BASE_URL}/api/frameworks/${frameworkId}/recommended-architectures`,
    capabilities: (frameworkId: string) => `${API_BASE_URL}/api/frameworks/${frameworkId}/recommended-capabilities`,
    endpoints: (frameworkId: string) => `${API_BASE_URL}/api/frameworks/${frameworkId}/recommended-endpoints`,
    readiness: (frameworkId: string) => `${API_BASE_URL}/api/frameworks/${frameworkId}/readiness`,
  },
  languageDomains: {
    profile: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/profile`,
    frameworks: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/frameworks`,
    architectures: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/architectures`,
    archetypes: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/archetypes`,
    capabilities: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/capabilities`,
    recommendations: (languageId: string) => `${API_BASE_URL}/api/languages/${languageId}/recommendations`,
  },
} as const;
