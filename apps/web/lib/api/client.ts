import { apiEndpoints } from '@/lib/api/endpoints';
import type {
  Architecture,
  Archetype,
  ApiErrorPayload,
  BusinessModule,
  BlueprintPreviewPayload,
  Capability,
  CompatibilityRule,
  DependencyGraphPayload,
  DependencyGraphSnapshot,
  DeliveryEstimate,
  EngineeringOperationalBurden,
  EngineeringReadinessPayload,
  EngineeringReadinessProfile,
  ImpactProfile,
  ReadinessProfile,
  RiskProfile,
  DownloadRecord,
  Framework,
  FrameworkArchitectureGuidance,
  FrameworkCapabilityGuidance,
  FrameworkEndpointGuidance,
  FrameworkReadinessProfile,
  FrameworkSpecialistProfile,
  GenerationHandoffPackage,
  GenerationHandoffPreviewPayload,
  InfrastructureComponent,
  InfrastructureRecommendation,
  InfrastructureRecommendationPayload,
  GatekeeperPreviewPayload,
  GeneratedFileContentResponse,
  GeneratedProjectFilesResponse,
  GatekeeperReport,
  HealthResponse,
  Language,
  LanguageDomainProfile,
  LanguageDomainRecommendation,
  Project,
  ProjectBlueprint,
  SaveProjectFromWizardPayload,
  PromptMasterDocument,
  PromptMasterPreviewPayload,
  RegistryEndpoint,
  Runtime,
  RuntimeFlow,
  SelectionValidationResponse,
  SkillCatalogResponse,
  SkillDefinition,
  SkillPreview,
  SkillPreviewRequest,
  SkillRecommendation,
  Stack,
  SystemStatusResponse,
  Template,
  TemplateCatalogResponse,
  TemplateCompatibilityResponse,
  TemplateMarketplaceItem,
  TemplateRecommendationResponse,
  TeamRecommendation,
  TeamTopology,
  UpdateProjectPayload,
  RoadmapResponse,
  ArchitectureTopology,
  ArchitecturalGraph,
  ArchitecturalGraphPayload,
  DependencyVisualization,
  DeploymentTopology,
  InfrastructureTopology,
  LocalGenerationRequest,
  LocalGenerationResult,
  PreparedDownloadResponse,
  ReadinessZone,
  RiskZone,
  SystemDesignVisualizationPayload,
  VisualizationSnapshot,
  ValidateSelectionPayload,
} from '@/lib/api/types';

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly unknown[];
  readonly isOffline: boolean;

  constructor({
    message,
    status,
    code,
    details = [],
    isOffline = false,
  }: {
    readonly message: string;
    readonly status: number;
    readonly code: string;
    readonly details?: readonly unknown[];
    readonly isOffline?: boolean;
  }) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isOffline = isOffline;
  }
}

const API_REQUEST_TIMEOUT_MS = 5_000;

function isApiErrorPayload(value: unknown): value is ApiErrorPayload {
  if (!value || typeof value !== 'object') return false;
  return 'error' in value;
}

async function parseResponseBody(response: Response) {
  const contentType = response.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
}

export async function apiRequest<T>(input: RequestInfo | URL, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), API_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(input, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    const body = await parseResponseBody(response);

    if (!response.ok) {
      const fallbackMessage = `HTTP ${response.status} request failed.`;
      if (isApiErrorPayload(body)) {
        throw new ApiClientError({
          status: response.status,
          code: body.error.code,
          message: body.error.message,
          details: body.error.details,
        });
      }

      throw new ApiClientError({
        status: response.status,
        code: `http_${response.status}`,
        message:
          body && typeof body === 'object' && 'message' in body && typeof body.message === 'string'
            ? body.message
            : fallbackMessage,
      });
    }

    return body as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    throw new ApiClientError({
      status: 0,
      code: 'backend_offline',
      message: 'Backend is offline or unreachable.',
      isOffline: true,
    });
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

function templateSelectionParams(selection: Partial<ValidateSelectionPayload>) {
  const params = new URLSearchParams();
  if (selection.language_id) params.set('language_id', selection.language_id);
  if (selection.framework_id) params.set('framework_id', selection.framework_id);
  if (selection.architecture_id) params.set('architecture_id', selection.architecture_id);
  if (selection.archetype_id) params.set('archetype_id', selection.archetype_id);
  for (const capabilityId of selection.capability_ids ?? []) {
    params.append('capability_ids', capabilityId);
  }
  return params;
}

function skillSelectionParams(selection: Partial<ValidateSelectionPayload> & { project_id?: string | null; has_generated_project?: boolean }) {
  const params = new URLSearchParams();
  if (selection.project_id) params.set('project_id', selection.project_id);
  if (selection.language_id) params.set('language_id', selection.language_id);
  if (selection.framework_id) params.set('framework_id', selection.framework_id);
  if (selection.architecture_id) params.set('architecture_id', selection.architecture_id);
  if (selection.archetype_id) params.set('archetype_id', selection.archetype_id);
  if (selection.has_generated_project) params.set('has_generated_project', 'true');
  return params;
}

export const apiClient = {
  getHealth: () => apiRequest<HealthResponse>(apiEndpoints.health),
  getStacks: () => apiRequest<Stack[]>(apiEndpoints.stacks),
  getRegistryStacks: () => apiRequest<Stack[]>(apiEndpoints.registry.stacks),
  getLanguages: () => apiRequest<Language[]>(apiEndpoints.registry.languages),
  getRuntimes: () => apiRequest<Runtime[]>(apiEndpoints.registry.runtimes),
  getFrameworks: () => apiRequest<Framework[]>(apiEndpoints.registry.frameworks),
  getFramework: (frameworkId: string) =>
    apiRequest<Framework>(apiEndpoints.registry.framework(frameworkId)),
  getFrameworkSpecialistProfile: (frameworkId: string) =>
    apiRequest<FrameworkSpecialistProfile>(apiEndpoints.frameworkSpecialists.profile(frameworkId)),
  getFrameworkRecommendedArchitectures: (frameworkId: string) =>
    apiRequest<FrameworkArchitectureGuidance[]>(apiEndpoints.frameworkSpecialists.architectures(frameworkId)),
  getFrameworkRecommendedCapabilities: (frameworkId: string) =>
    apiRequest<FrameworkCapabilityGuidance[]>(apiEndpoints.frameworkSpecialists.capabilities(frameworkId)),
  getFrameworkRecommendedEndpoints: (frameworkId: string) =>
    apiRequest<FrameworkEndpointGuidance[]>(apiEndpoints.frameworkSpecialists.endpoints(frameworkId)),
  getFrameworkReadiness: (frameworkId: string) =>
    apiRequest<FrameworkReadinessProfile>(apiEndpoints.frameworkSpecialists.readiness(frameworkId)),
  getLanguageFrameworks: (languageId: string) =>
    apiRequest<Framework[]>(apiEndpoints.languageDomains.frameworks(languageId)),
  getLanguageProfile: (languageId: string) =>
    apiRequest<LanguageDomainProfile>(apiEndpoints.languageDomains.profile(languageId)),
  getLanguageArchitectures: (languageId: string) =>
    apiRequest<Architecture[]>(apiEndpoints.languageDomains.architectures(languageId)),
  getLanguageArchetypes: (languageId: string) =>
    apiRequest<Archetype[]>(apiEndpoints.languageDomains.archetypes(languageId)),
  getLanguageCapabilities: (languageId: string) =>
    apiRequest<Capability[]>(apiEndpoints.languageDomains.capabilities(languageId)),
  getLanguageRecommendations: (languageId: string) =>
    apiRequest<LanguageDomainRecommendation[]>(apiEndpoints.languageDomains.recommendations(languageId)),
  getFrameworkArchitectures: (frameworkId: string) =>
    apiRequest<Architecture[]>(apiEndpoints.registry.frameworkArchitectures(frameworkId)),
  getArchitectures: () => apiRequest<Architecture[]>(apiEndpoints.registry.architectures),
  getArchetypes: () => apiRequest<Archetype[]>(apiEndpoints.registry.archetypes),
  getArchetype: (archetypeId: string) =>
    apiRequest<Archetype>(apiEndpoints.registry.archetype(archetypeId)),
  getCapabilities: () => apiRequest<Capability[]>(apiEndpoints.registry.capabilities),
  getBusinessModules: () =>
    apiRequest<BusinessModule[]>(apiEndpoints.registry.businessModules),
  getRegistryEndpoints: () =>
    apiRequest<RegistryEndpoint[]>(apiEndpoints.registry.endpoints),
  getCompatibilityRules: () =>
    apiRequest<CompatibilityRule[]>(apiEndpoints.registry.compatibility),
  getStackArchetypes: (stackId: string) =>
    apiRequest<Archetype[]>(apiEndpoints.registry.stackArchetypes(stackId)),
  getFrameworkArchetypes: (frameworkId: string) =>
    apiRequest<Archetype[]>(apiEndpoints.registry.frameworkArchetypes(frameworkId)),
  getStackCapabilities: (stackId: string) =>
    apiRequest<Capability[]>(apiEndpoints.registry.stackCapabilities(stackId)),
  getModuleEndpoints: (moduleId: string) =>
    apiRequest<RegistryEndpoint[]>(apiEndpoints.registry.moduleEndpoints(moduleId)),
  getInfrastructureComponents: () =>
    apiRequest<InfrastructureComponent[]>(apiEndpoints.infrastructure.components),
  getInfrastructureCategories: () =>
    apiRequest<string[]>(apiEndpoints.infrastructure.categories),
  getInfrastructureComponent: (componentId: string) =>
    apiRequest<InfrastructureComponent>(apiEndpoints.infrastructure.component(componentId)),
  getInfrastructureRecommendations: (body: InfrastructureRecommendationPayload) =>
    apiRequest<InfrastructureRecommendation>(apiEndpoints.infrastructure.recommendations, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDependencyGraphPreview: (body: DependencyGraphPayload) =>
    apiRequest<DependencyGraphSnapshot>(apiEndpoints.dependencyGraph.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDependencyGraphImpact: (body: DependencyGraphPayload) =>
    apiRequest<ImpactProfile>(apiEndpoints.dependencyGraph.impact, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDependencyGraphReadiness: (body: DependencyGraphPayload) =>
    apiRequest<ReadinessProfile>(apiEndpoints.dependencyGraph.readiness, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getDependencyGraphRisks: (body: DependencyGraphPayload) =>
    apiRequest<RiskProfile>(apiEndpoints.dependencyGraph.risks, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getEngineeringReadiness: (body: EngineeringReadinessPayload) =>
    apiRequest<EngineeringReadinessProfile>(apiEndpoints.engineering.readiness, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getEngineeringTeamProfile: (body: EngineeringReadinessPayload) =>
    apiRequest<TeamRecommendation>(apiEndpoints.engineering.teamProfile, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getEngineeringDeliveryEstimate: (body: EngineeringReadinessPayload) =>
    apiRequest<DeliveryEstimate>(apiEndpoints.engineering.deliveryEstimate, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getEngineeringOperationalBurden: (body: EngineeringReadinessPayload) =>
    apiRequest<EngineeringOperationalBurden>(apiEndpoints.engineering.operationalBurden, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getArchitectureTopology: (body: SystemDesignVisualizationPayload) =>
    apiRequest<ArchitectureTopology>(apiEndpoints.systemDesign.architectureTopology, { method: 'POST', body: JSON.stringify(body) }),
  getInfrastructureTopology: (body: SystemDesignVisualizationPayload) =>
    apiRequest<InfrastructureTopology>(apiEndpoints.systemDesign.infrastructureTopology, { method: 'POST', body: JSON.stringify(body) }),
  getRuntimeFlow: (body: SystemDesignVisualizationPayload) =>
    apiRequest<RuntimeFlow>(apiEndpoints.systemDesign.runtimeFlow, { method: 'POST', body: JSON.stringify(body) }),
  getDependencyVisualization: (body: SystemDesignVisualizationPayload) =>
    apiRequest<DependencyVisualization>(apiEndpoints.systemDesign.dependencyVisualization, { method: 'POST', body: JSON.stringify(body) }),
  getRiskZones: (body: SystemDesignVisualizationPayload) =>
    apiRequest<RiskZone[]>(apiEndpoints.systemDesign.riskZones, { method: 'POST', body: JSON.stringify(body) }),
  getReadinessZones: (body: SystemDesignVisualizationPayload) =>
    apiRequest<ReadinessZone[]>(apiEndpoints.systemDesign.readinessZones, { method: 'POST', body: JSON.stringify(body) }),
  getTeamTopology: (body: SystemDesignVisualizationPayload) =>
    apiRequest<TeamTopology>(apiEndpoints.systemDesign.teamTopology, { method: 'POST', body: JSON.stringify(body) }),
  getDeploymentTopology: (body: SystemDesignVisualizationPayload) =>
    apiRequest<DeploymentTopology>(apiEndpoints.systemDesign.deploymentTopology, { method: 'POST', body: JSON.stringify(body) }),
  getSystemDesignSnapshot: (body: SystemDesignVisualizationPayload) =>
    apiRequest<VisualizationSnapshot>(apiEndpoints.systemDesign.snapshot, { method: 'POST', body: JSON.stringify(body) }),
  getArchitecturalGraphPreview: (body: ArchitecturalGraphPayload) =>
    apiRequest<ArchitecturalGraph>(apiEndpoints.architecturalGraph.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  validateSelection: (body: ValidateSelectionPayload) =>
    apiRequest<SelectionValidationResponse>(apiEndpoints.registry.validateSelection, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  previewBlueprint: (body: BlueprintPreviewPayload) =>
    apiRequest<ProjectBlueprint>(apiEndpoints.blueprints.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  previewPromptMaster: (body: PromptMasterPreviewPayload) =>
    apiRequest<PromptMasterDocument>(apiEndpoints.promptMaster.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  previewGatekeeper: (body: GatekeeperPreviewPayload) =>
    apiRequest<GatekeeperReport>(apiEndpoints.gatekeeper.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  previewGenerationHandoff: (body: GenerationHandoffPreviewPayload) =>
    apiRequest<GenerationHandoffPackage>(apiEndpoints.generationHandoff.preview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  runLocalGeneration: (body: LocalGenerationRequest) =>
    apiRequest<LocalGenerationResult>(apiEndpoints.localGeneration.run, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getGeneratedFiles: (projectId: string) =>
    apiRequest<GeneratedProjectFilesResponse>(apiEndpoints.localGeneration.files(projectId)),
  getGeneratedFileContent: (projectId: string, path: string) =>
    apiRequest<GeneratedFileContentResponse>(apiEndpoints.localGeneration.fileContent(projectId, path)),
  prepareGeneratedDownload: (projectId: string) =>
    apiRequest<PreparedDownloadResponse>(apiEndpoints.localGeneration.prepareDownload(projectId), {
      method: 'POST',
    }),
  getTemplates: () => apiRequest<Template[]>(apiEndpoints.templates),
  getSkills: () => apiRequest<SkillCatalogResponse>(apiEndpoints.skills),
  getSkill: (skillId: string) => apiRequest<SkillDefinition>(apiEndpoints.skill(skillId)),
  getSkillCategories: () => apiRequest<string[]>(apiEndpoints.skillCategories),
  getRecommendedSkills: (selection: Partial<ValidateSelectionPayload> & { project_id?: string | null; has_generated_project?: boolean }) =>
    apiRequest<SkillRecommendation[]>(apiEndpoints.skillRecommended(skillSelectionParams(selection))),
  previewSkill: (body: SkillPreviewRequest) =>
    apiRequest<SkillPreview>(apiEndpoints.skillPreview, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  getSystemStatus: () => apiRequest<SystemStatusResponse>(apiEndpoints.systemStatus),
  getRoadmap: () => apiRequest<RoadmapResponse>(apiEndpoints.roadmap),
  getTemplateCatalog: () => apiRequest<TemplateCatalogResponse>(apiEndpoints.templateCatalog),
  getTemplateCategories: () => apiRequest<string[]>(apiEndpoints.templateCategories),
  getTemplate: (templateId: string) => apiRequest<TemplateMarketplaceItem>(apiEndpoints.template(templateId)),
  getTemplateCompatibility: (templateId: string, selection: Partial<ValidateSelectionPayload>) =>
    apiRequest<TemplateCompatibilityResponse>(apiEndpoints.templateCompatibility(templateId, templateSelectionParams(selection))),
  getRecommendedTemplates: (selection: Partial<ValidateSelectionPayload>) =>
    apiRequest<TemplateRecommendationResponse>(apiEndpoints.templateRecommended(templateSelectionParams(selection))),
  getProjects: () => apiRequest<Project[]>(apiEndpoints.projects),
  getProject: (projectId: string) => apiRequest<Project>(apiEndpoints.project(projectId)),
  saveProjectFromWizard: (body: SaveProjectFromWizardPayload) =>
    apiRequest<Project>(apiEndpoints.projectRegistry.saveFromWizard, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProject: (projectId: string, body: UpdateProjectPayload) =>
    apiRequest<Project>(apiEndpoints.project(projectId), {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  deleteProject: (projectId: string) =>
    apiRequest<void>(apiEndpoints.project(projectId), {
      method: 'DELETE',
    }),
  getDownloads: () => apiRequest<DownloadRecord[]>(apiEndpoints.downloads),
};
