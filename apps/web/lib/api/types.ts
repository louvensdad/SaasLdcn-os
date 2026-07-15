import type {
  AccountDeletionResponse as AccountDeletionResponseContract,
  AuthResponse as AuthResponseContract,
  ConsentRequest as ConsentRequestContract,
  DataExportResponse as DataExportResponseContract,
  PasswordChangeRequest as PasswordChangeRequestContract,
  RefreshRequest as RefreshRequestContract,
  TokenResponse as TokenResponseContract,
  UserLoginRequest as UserLoginRequestContract,
  UserPublic as UserPublicContract,
  UserRegisterRequest as UserRegisterRequestContract,
  UserRole as UserRoleContract,
  UserUpdateRequest as UserUpdateRequestContract,
} from '@contracts/auth.contract';
import type { ArchitectureContract } from '@contracts/architecture.contract';
import type { ArchitectureLevelContract } from '@contracts/architecture-level.contract';
import type { ArchetypeContract } from '@contracts/archetype.contract';
import type {
  BlueprintGenerationMode,
  ProjectRequirements as ProjectRequirementsContract,
  ProjectBlueprint as ProjectBlueprintContract,
} from '@contracts/blueprint.contract';
import type { BusinessModuleContract } from '@contracts/business-module.contract';
import type { CapabilityContract } from '@contracts/capability.contract';
import type { CompatibilityRuleContract } from '@contracts/compatibility.contract';
import type { EndpointContract } from '@contracts/endpoint.contract';
import type { FrameworkContract } from '@contracts/framework.contract';
import type {
  FrameworkArchitectureGuidance as FrameworkArchitectureGuidanceContract,
  FrameworkCapabilityGuidance as FrameworkCapabilityGuidanceContract,
  FrameworkEndpointGuidance as FrameworkEndpointGuidanceContract,
  FrameworkReadinessProfile as FrameworkReadinessProfileContract,
  FrameworkSpecialistProfile as FrameworkSpecialistProfileContract,
} from '@contracts/framework-specialist.contract';
import type {
  ArchitectureMutation as ArchitectureMutationContract,
  DependencyEdge as DependencyEdgeContract,
  DependencyGraphSnapshot as DependencyGraphSnapshotContract,
  DependencyNode as DependencyNodeContract,
  DependencyPropagation as DependencyPropagationContract,
  DependencyRule as DependencyRuleContract,
  ImpactProfile as ImpactProfileContract,
  ReadinessProfile as ReadinessProfileContract,
  RiskProfile as RiskProfileContract,
} from '@contracts/dependency-graph.contract';
import type {
  DeliveryEstimate as DeliveryEstimateContract,
  EngineeringReadinessProfile as EngineeringReadinessProfileContract,
  OperationalBurden as OperationalBurdenContract,
  TeamRecommendation as TeamRecommendationContract,
} from '@contracts/engineering-readiness.contract';
import type {
  ArchitectureTopology as ArchitectureTopologyContract,
  DependencyVisualization as DependencyVisualizationContract,
  DeploymentTopology as DeploymentTopologyContract,
  InfrastructureTopology as InfrastructureTopologyContract,
  ReadinessZone as ReadinessZoneContract,
  RiskZone as RiskZoneContract,
  RuntimeFlow as RuntimeFlowContract,
  ServiceNode as ServiceNodeContract,
  TeamTopology as TeamTopologyContract,
  VisualizationSnapshot as VisualizationSnapshotContract,
} from '@contracts/system-design-visualization.contract';
import type {
  ArchitecturalEdge as ArchitecturalEdgeContract,
  ArchitecturalGraph as ArchitecturalGraphContract,
  ArchitecturalNode as ArchitecturalNodeContract,
  GraphSnapshot as ArchitecturalGraphSnapshotContract,
  GraphLayout as ArchitecturalGraphLayoutContract,
} from '@contracts/architectural-graph.contract';
import type {
  InfrastructureCategory as InfrastructureCategoryContract,
  InfrastructureCompatibilityRule as InfrastructureCompatibilityRuleContract,
  InfrastructureComponent as InfrastructureComponentContract,
  InfrastructureProfile as InfrastructureProfileContract,
  InfrastructureProvider as InfrastructureProviderContract,
  InfrastructureRecommendation as InfrastructureRecommendationContract,
} from '@contracts/infrastructure.contract';
import type { LanguageContract } from '@contracts/language.contract';
import type {
  LocaleDefinition as LocaleDefinitionContract,
  LocalizationPreviewRequest as LocalizationPreviewRequestContract,
  LocalizationPreviewResponse as LocalizationPreviewResponseContract,
  LocalizationValidationResponse as LocalizationValidationResponseContract,
  TranslationDictionary as TranslationDictionaryContract,
} from '@contracts/locale.contract';
import type {
  LanguageDomainArchitectureSet as LanguageDomainArchitectureSetContract,
  LanguageDomainCapabilitySet as LanguageDomainCapabilitySetContract,
  LanguageDomainFrameworkSet as LanguageDomainFrameworkSetContract,
  LanguageDomainProfile as LanguageDomainProfileContract,
  LanguageDomainRecommendation as LanguageDomainRecommendationContract,
} from '@contracts/language-domain.contract';
import type {
  ProjectRecord as ProjectRecordContract,
  SaveProjectFromWizardPayload as SaveProjectFromWizardPayloadContract,
  UpdateProjectPayload as UpdateProjectPayloadContract,
} from '@contracts/project.contract';
import type {
  GatekeeperPreviewPayload as GatekeeperPreviewPayloadContract,
  GatekeeperReport as GatekeeperReportContract,
} from '@contracts/gatekeeper.contract';
import type { GenerationHandoffPackage as GenerationHandoffPackageContract } from '@contracts/generation-handoff.contract';
import type {
  BackendGenerationRequest as BackendGenerationRequestContract,
  BackendGenerationTemplateCatalog as BackendGenerationTemplateCatalogContract,
  GenerationManifest as BackendGenerationManifestContract,
} from '@contracts/backend-generation.contract';
import type {
  GeneratedFileContentResponse as GeneratedFileContentResponseContract,
  GeneratedProjectFilesResponse as GeneratedProjectFilesResponseContract,
  LocalGenerationRequest as LocalGenerationRequestContract,
  LocalGenerationResult as LocalGenerationResultContract,
  PreparedDownloadResponse as PreparedDownloadResponseContract,
} from '@contracts/local-generation.contract';
import type { GeneratedProjectQualityResponse as GeneratedProjectQualityResponseContract } from '@contracts/generated-project-quality.contract';
import type {
  DocumentationDoc as DocumentationDocContract,
  DocumentationCheck as DocumentationCheckContract,
  DocumentationFinding as DocumentationFindingContract,
  DocumentationLibraryResponse as DocumentationLibraryResponseContract,
  DocumentationExportResponse as DocumentationExportResponseContract,
  GeneratedDoc as GeneratedDocContract,
  DocumentationGenerateRequest as DocumentationGenerateRequestContract,
  DocumentationGenerateResponse as DocumentationGenerateResponseContract,
  DocumentationSaveRequest as DocumentationSaveRequestContract,
  DocumentationSaveResponse as DocumentationSaveResponseContract,
} from '@contracts/documentation.contract';
import type {
  GitExportJob as GitExportJobContract,
  GitExportRequest as GitExportRequestContract,
  GitExportStatusResponse as GitExportStatusResponseContract,
} from '@contracts/git-export.contract';
import type {
  GitProviderConnection as GitProviderConnectionContract,
  RepositoryCreateRequest as RepositoryCreateRequestContract,
  RepositoryDelivery as RepositoryDeliveryContract,
} from '@contracts/git-provider.contract';
import type {
  ContractUnderstandingReport as ContractUnderstandingReportContract,
  PdfContractUploadPolicy as PdfContractUploadPolicyContract,
  PdfContractUploadResponse as PdfContractUploadResponseContract,
} from '@contracts/pdf-contract.contract';
import type {
  PromptMasterDocument as PromptMasterDocumentContract,
  PromptMasterPreviewPayload as PromptMasterPreviewPayloadContract,
} from '@contracts/prompt-master.contract';
import type { RuntimeContract } from '@contracts/runtime.contract';
import type { StackContract } from '@contracts/stack.contract';
import type {
  RoadmapResponse as RoadmapResponseContract,
} from '@contracts/roadmap.contract';
import type {
  SkillCatalogResponse as SkillCatalogResponseContract,
  SkillDefinition as SkillDefinitionContract,
  SkillPreview as SkillPreviewContract,
  SkillPreviewRequest as SkillPreviewRequestContract,
  SkillRecommendation as SkillRecommendationContract,
} from '@contracts/skill.contract';
import type {
  SystemStatusResponse as SystemStatusResponseContract,
} from '@contracts/system-status.contract';
import type {
  TemplateCatalogResponse as TemplateCatalogResponseContract,
  TemplateCompatibilityResponse as TemplateCompatibilityResponseContract,
  TemplateContract,
  TemplateMarketplaceItem as TemplateMarketplaceItemContract,
  TemplateRecommendationResponse as TemplateRecommendationResponseContract,
} from '@contracts/template.contract';
import type {
  DeleteUserKeyBoostSessionResponse as DeleteUserKeyBoostSessionResponseContract,
  UserKeyBoostSessionRequest as UserKeyBoostSessionRequestContract,
  UserKeyBoostSessionResponse as UserKeyBoostSessionResponseContract,
  UserKeyBoostStatusResponse as UserKeyBoostStatusResponseContract,
} from '@contracts/user-key-boost.contract';

export interface ApiErrorDetail {
  readonly location?: readonly (string | number)[];
  readonly message: string;
  readonly type?: string | null;
}

export interface ApiErrorPayload {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly ApiErrorDetail[];
  };
}

export interface HealthResponse {
  readonly status: 'ok' | 'degraded' | 'offline';
  readonly service: string;
  readonly version: string;
}

export type UserRole = UserRoleContract;
export type UserPublic = UserPublicContract;
export type TokenResponse = TokenResponseContract;
export type AuthResponse = AuthResponseContract;
export type UserRegisterRequest = UserRegisterRequestContract;
export type UserLoginRequest = UserLoginRequestContract;
export type RefreshRequest = RefreshRequestContract;
export type UserUpdateRequest = UserUpdateRequestContract;
export type PasswordChangeRequest = PasswordChangeRequestContract;
export type ConsentRequest = ConsentRequestContract;
export type DataExportResponse = DataExportResponseContract;
export type AccountDeletionResponse = AccountDeletionResponseContract;

export type Stack = StackContract;
export type SkillCatalogResponse = SkillCatalogResponseContract;
export type SkillDefinition = SkillDefinitionContract;
export type SkillRecommendation = SkillRecommendationContract;
export type SkillPreview = SkillPreviewContract;
export type SkillPreviewRequest = SkillPreviewRequestContract;
export type SystemStatusResponse = SystemStatusResponseContract;
export type RoadmapResponse = RoadmapResponseContract;
export type Template = TemplateContract;
export type TemplateCatalogResponse = TemplateCatalogResponseContract;
export type TemplateMarketplaceItem = TemplateMarketplaceItemContract;
export type TemplateCompatibilityResponse = TemplateCompatibilityResponseContract;
export type TemplateRecommendationResponse = TemplateRecommendationResponseContract;
export type Language = LanguageContract;
export type Runtime = RuntimeContract;
export type Framework = FrameworkContract;
export type FrameworkSpecialistProfile = FrameworkSpecialistProfileContract;
export type FrameworkArchitectureGuidance = FrameworkArchitectureGuidanceContract;
export type FrameworkCapabilityGuidance = FrameworkCapabilityGuidanceContract;
export type FrameworkEndpointGuidance = FrameworkEndpointGuidanceContract;
export type FrameworkReadinessProfile = FrameworkReadinessProfileContract;
export type DependencyNode = DependencyNodeContract;
export type DependencyEdge = DependencyEdgeContract;
export type DependencyRule = DependencyRuleContract;
export type DependencyPropagation = DependencyPropagationContract;
export type ImpactProfile = ImpactProfileContract;
export type ReadinessProfile = ReadinessProfileContract;
export type RiskProfile = RiskProfileContract;
export type ArchitectureMutation = ArchitectureMutationContract;
export type DependencyGraphSnapshot = DependencyGraphSnapshotContract;
export type EngineeringReadinessProfile = EngineeringReadinessProfileContract;
export type TeamRecommendation = TeamRecommendationContract;
export type DeliveryEstimate = DeliveryEstimateContract;
export type EngineeringOperationalBurden = OperationalBurdenContract;
export type ArchitectureTopology = ArchitectureTopologyContract;
export type InfrastructureTopology = InfrastructureTopologyContract;
export type RuntimeFlow = RuntimeFlowContract;
export type ServiceNode = ServiceNodeContract;
export type DependencyVisualization = DependencyVisualizationContract;
export type RiskZone = RiskZoneContract;
export type ReadinessZone = ReadinessZoneContract;
export type TeamTopology = TeamTopologyContract;
export type DeploymentTopology = DeploymentTopologyContract;
export type VisualizationSnapshot = VisualizationSnapshotContract;
export type ArchitecturalGraph = ArchitecturalGraphContract;
export type ArchitecturalGraphSnapshot = ArchitecturalGraphSnapshotContract;
export type ArchitecturalNode = ArchitecturalNodeContract;
export type ArchitecturalEdge = ArchitecturalEdgeContract;
export type ArchitecturalGraphLayout = ArchitecturalGraphLayoutContract;
export type InfrastructureCategory = InfrastructureCategoryContract;
export type InfrastructureProvider = InfrastructureProviderContract;
export type InfrastructureComponent = InfrastructureComponentContract;
export type InfrastructureCompatibilityRule = InfrastructureCompatibilityRuleContract;
export type InfrastructureRecommendation = InfrastructureRecommendationContract;
export type InfrastructureProfile = InfrastructureProfileContract;
export type Architecture = ArchitectureContract;
export type Archetype = ArchetypeContract;
export type Capability = CapabilityContract;
export type LanguageDomainProfile = LanguageDomainProfileContract;
export type LanguageDomainRecommendation = LanguageDomainRecommendationContract;
export type LanguageDomainFrameworkSet = LanguageDomainFrameworkSetContract;
export type LanguageDomainArchitectureSet = LanguageDomainArchitectureSetContract;
export type LanguageDomainCapabilitySet = LanguageDomainCapabilitySetContract;
export type BusinessModule = BusinessModuleContract;
export type RegistryEndpoint = EndpointContract;
export type ArchitectureLevel = ArchitectureLevelContract;
export type CompatibilityRule = CompatibilityRuleContract;
export type ProjectBlueprint = ProjectBlueprintContract;
export type ProjectRequirements = ProjectRequirementsContract;
export type LocaleDefinition = LocaleDefinitionContract;
export type TranslationDictionary = TranslationDictionaryContract;
export type LocalizationPreviewRequest = LocalizationPreviewRequestContract;
export type LocalizationPreviewResponse = LocalizationPreviewResponseContract;
export type LocalizationValidationResponse = LocalizationValidationResponseContract;
export type GatekeeperReport = GatekeeperReportContract;
export type PromptMasterDocument = PromptMasterDocumentContract;
export type GenerationHandoffPackage = GenerationHandoffPackageContract;
export type BackendGenerationRequest = BackendGenerationRequestContract;
export type BackendGenerationManifest = BackendGenerationManifestContract;
export type BackendGenerationTemplateCatalog = BackendGenerationTemplateCatalogContract;
export type LocalGenerationRequest = LocalGenerationRequestContract;
export type LocalGenerationResult = LocalGenerationResultContract;
export type GeneratedProjectFilesResponse = GeneratedProjectFilesResponseContract;
export type GeneratedFileContentResponse = GeneratedFileContentResponseContract;
export type PreparedDownloadResponse = PreparedDownloadResponseContract;
export type GeneratedProjectQualityResponse = GeneratedProjectQualityResponseContract;
export type UserKeyBoostSessionRequest = UserKeyBoostSessionRequestContract;
export type UserKeyBoostSessionResponse = UserKeyBoostSessionResponseContract;
export type UserKeyBoostStatusResponse = UserKeyBoostStatusResponseContract;
export type DeleteUserKeyBoostSessionResponse = DeleteUserKeyBoostSessionResponseContract;
export type GitExportRequest = GitExportRequestContract;
export type GitExportJob = GitExportJobContract;
export type GitExportStatusResponse = GitExportStatusResponseContract;
export type GitProviderConnection = GitProviderConnectionContract;
export type RepositoryCreateRequest = RepositoryCreateRequestContract;
export type RepositoryDelivery = RepositoryDeliveryContract;
export type PdfContractUploadPolicy = PdfContractUploadPolicyContract;
export type PdfContractUploadResponse = PdfContractUploadResponseContract;
export type ContractUnderstandingReport = ContractUnderstandingReportContract;

export type Project = ProjectRecordContract;
export type SaveProjectFromWizardPayload = SaveProjectFromWizardPayloadContract;
export type UpdateProjectPayload = UpdateProjectPayloadContract;

export type DocumentationDoc = DocumentationDocContract;
export type DocumentationCheck = DocumentationCheckContract;
export type DocumentationFinding = DocumentationFindingContract;
export type DocumentationLibraryResponse = DocumentationLibraryResponseContract;
export type DocumentationExportResponse = DocumentationExportResponseContract;
export type GeneratedDoc = GeneratedDocContract;
export type DocumentationGenerateRequest = DocumentationGenerateRequestContract;
export type DocumentationGenerateResponse = DocumentationGenerateResponseContract;
export type DocumentationSaveRequest = DocumentationSaveRequestContract;
export type DocumentationSaveResponse = DocumentationSaveResponseContract;

export interface DownloadRecord {
  readonly downloadId: string;
  readonly projectId: string;
  readonly workspaceId?: string | null;
  readonly status: 'prepared' | 'downloaded' | 'expired';
  readonly artifactId: string;
  readonly checksumSha256: string;
  readonly sizeBytes: number;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly downloadedAt?: string | null;
  readonly downloadUrl: string;
}

export interface ValidateSelectionPayload {
  readonly language_id: string;
  readonly runtime_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly archetype_id: string;
  readonly capability_ids: readonly string[];
  readonly business_module_ids: readonly string[];
  readonly endpoint_ids: readonly string[];
}

export interface ValidationMessage {
  readonly code: string;
  readonly message: string;
  readonly suggestion?: string;
  readonly related_ids: readonly string[];
}

export interface SelectionValidationResponse {
  readonly valid: boolean;
  readonly errors: readonly ValidationMessage[];
  readonly warnings: readonly ValidationMessage[];
  readonly recommended_additions: readonly string[];
  readonly resolved_blueprint_summary: Readonly<Record<string, unknown>>;
}

export interface BlueprintPreviewPayload {
  readonly project_name: string;
  readonly language_id: string;
  readonly runtime_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly archetype_id: string;
  readonly capability_ids: readonly string[];
  readonly business_module_ids: readonly string[];
  readonly endpoint_ids: readonly string[];
  readonly infrastructure_component_ids: readonly string[];
  readonly locale: string;
  readonly generation_mode: BlueprintGenerationMode | string;
  readonly project_requirements: ProjectRequirementsContract;
}

export interface InfrastructureRecommendationPayload {
  readonly language_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly archetype_id: string;
  readonly capability_ids: readonly string[];
  readonly architecture_level: string;
}

export interface DependencyGraphPayload {
  readonly language_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly capability_ids: readonly string[];
  readonly infrastructure_ids: readonly string[];
  readonly archetype_id?: string | null;
}

export interface EngineeringReadinessPayload {
  readonly language_id: string;
  readonly framework_id: string;
  readonly architecture_id: string;
  readonly capability_ids: readonly string[];
  readonly infrastructure_ids: readonly string[];
}

export type SystemDesignVisualizationPayload = EngineeringReadinessPayload;

export interface ArchitecturalGraphPayload extends EngineeringReadinessPayload {
  readonly business_module_ids: readonly string[];
}

export type PromptMasterPreviewPayload = PromptMasterPreviewPayloadContract;
export type GatekeeperPreviewPayload = GatekeeperPreviewPayloadContract;

export interface GenerationHandoffPreviewPayload {
  readonly project_id: string;
}
