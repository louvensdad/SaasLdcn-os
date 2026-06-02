'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Database, Layers3, Sparkles } from 'lucide-react';

import { LDCNPresenceRail } from '@/components/ldcn/ldcn-presence-rail';
import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/empty-states/empty-state';
import { PageError } from '@/components/feedback/error-system';
import { ButtonLoading, CardLoading } from '@/components/feedback/loading-system';
import { CheckboxField, SelectField, TextField } from '@/components/forms/form-field';
import { SectionHeader } from '@/components/shell/section-header';
import {
  ArchitectureGraphSurface,
  ComplexityRadar,
  DeploymentPathSurface,
  OperationalRail,
  ReadinessRing,
  StackEcosystemMap,
  SurfaceDivider,
  SurfaceLabel,
  SurfaceIcon,
} from '@/components/visual/engineering-surface';
import { useBlueprintPreview } from '@/hooks/use-blueprint-preview';
import { useDependencyGraph } from '@/hooks/use-dependency-graph';
import { useBusinessModules } from '@/hooks/use-business-modules';
import { useInfrastructureComponents } from '@/hooks/use-infrastructure-components';
import { useImpactAnalysis } from '@/hooks/use-impact-analysis';
import { useEngineeringReadiness } from '@/hooks/use-engineering-readiness';
import { useInfrastructureRecommendations } from '@/hooks/use-infrastructure-recommendations';
import { useEndpoints } from '@/hooks/use-endpoints';
import { useFrameworkReadiness } from '@/hooks/use-framework-readiness';
import { useFrameworkRecommendations } from '@/hooks/use-framework-recommendations';
import { useFrameworkSpecialistProfile } from '@/hooks/use-framework-specialist-profile';
import { useLanguageArchitectures } from '@/hooks/use-language-architectures';
import { useLanguageArchetypes } from '@/hooks/use-language-archetypes';
import { useLanguageCapabilities } from '@/hooks/use-language-capabilities';
import { useLanguageFrameworks } from '@/hooks/use-language-frameworks';
import { useLanguageProfile } from '@/hooks/use-language-profile';
import { useLanguageRecommendations } from '@/hooks/use-language-recommendations';
import { useReadinessAnalysis } from '@/hooks/use-readiness-analysis';
import { useDeliveryEstimate } from '@/hooks/use-delivery-estimate';
import { useGatekeeperPreview } from '@/hooks/use-gatekeeper-preview';
import { useRiskAnalysis } from '@/hooks/use-risk-analysis';
import { useTeamProfile } from '@/hooks/use-team-profile';
import { useLanguages } from '@/hooks/use-languages';
import { usePromptMasterPreview } from '@/hooks/use-prompt-master-preview';
import { useSaveProjectFromWizard } from '@/hooks/use-projects';
import { useRuntimes } from '@/hooks/use-runtimes';
import { useRecommendedSkills } from '@/hooks/use-skills';
import { useRecommendedTemplates } from '@/hooks/use-templates';
import { getApiErrorMessage } from '@/lib/api/errors';
import type {
  Architecture,
  Archetype,
  BusinessModule,
  Capability,
  DependencyGraphPayload,
  InfrastructureRecommendationPayload,
  RegistryEndpoint,
  ValidateSelectionPayload,
} from '@/lib/api/types';
import { useLDCNStore } from '@/stores/use-ldcn-store';
import { useUiStore } from '@/stores/use-ui-store';
import { FrameworkSpecialistPanel } from '@/components/wizard/framework-specialist-panel';
import { DependencyGraphPanel } from '@/components/wizard/dependency-graph-panel';
import { InfrastructureRecommendationsPanel } from '@/components/wizard/infrastructure-recommendations-panel';
import { EngineeringReadinessPanel } from '@/components/wizard/engineering-readiness-panel';
import { VisualizationCockpit } from '@/components/system-design/visualization-cockpit';
import { ArchitecturalGraphCanvas } from '@/components/architectural-graph/architectural-graph-canvas';

type WizardStepId =
  | 'technology_path'
  | 'architecture'
  | 'project_type'
  | 'capabilities'
  | 'business_modules'
  | 'endpoints'
  | 'blueprint_review';

type StepVisualState = 'locked' | 'active' | 'completed' | 'warning' | 'error';

interface WizardStepDefinition {
  readonly id: WizardStepId;
  readonly title: string;
  readonly eyebrow: string;
  readonly description: string;
}

const WIZARD_STEPS: readonly WizardStepDefinition[] = [
  {
    id: 'technology_path',
    title: 'Technology Path',
    eyebrow: 'Step 1',
    description: 'Choose language, runtime, and framework.',
  },
  {
    id: 'architecture',
    title: 'Architecture',
    eyebrow: 'Step 2',
    description: 'Define the structural style and complexity.',
  },
  {
    id: 'project_type',
    title: 'Project Type',
    eyebrow: 'Step 3',
    description: 'Select the archetype that matches the product goal.',
  },
  {
    id: 'capabilities',
    title: 'Capabilities',
    eyebrow: 'Step 4',
    description: 'Start with recommended capabilities and expand only if needed.',
  },
  {
    id: 'business_modules',
    title: 'Business Modules',
    eyebrow: 'Step 5',
    description: 'Pick the operational domains that shape the blueprint.',
  },
  {
    id: 'endpoints',
    title: 'Endpoints',
    eyebrow: 'Step 6',
    description: 'Reveal route groups by module and select in batches.',
  },
  {
    id: 'blueprint_review',
    title: 'Blueprint Review',
    eyebrow: 'Step 7',
    description: 'Inspect validation, warnings, recommendations, and complexity.',
  },
] as const;

const STEP_INDEX_BY_ID = Object.fromEntries(WIZARD_STEPS.map((step, index) => [step.id, index])) as Record<
  WizardStepId,
  number
>;

const CAPABILITY_CATEGORY_LABELS: Record<string, string> = {
  security: 'Security',
  platform: 'Platform',
  commerce: 'Commerce',
  communication: 'Communication',
  ai: 'AI',
  data: 'Data',
  quality: 'Quality',
  experience: 'Experience',
};

const MODULE_CATEGORY_LABELS: Record<string, string> = {
  core: 'Core',
  commerce: 'Commerce',
  operations: 'Operations',
  finance: 'Finance',
  communication: 'Communication',
  governance: 'Governance',
  education: 'Education',
};

const LOCALE_OPTIONS = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'] as const;
const GENERATION_MODE_OPTIONS = [
  { value: 'local_build_90', label: 'Local build 90' },
  { value: 'foundation_only', label: 'Foundation only' },
  { value: 'template_assisted', label: 'Template assisted' },
  { value: 'guided', label: 'Guided' },
] as const;

function toggleSelection(current: readonly string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function createRegionId(stepId: WizardStepId) {
  return `wizard-step-region-${stepId}`;
}

function createTriggerId(stepId: WizardStepId) {
  return `wizard-step-trigger-${stepId}`;
}

function formatComplexityLabel(value?: string | null) {
  if (!value) return 'pending';
  return value.replaceAll('_', ' ');
}

function gatekeeperToneFromStatus(
  status: string,
): 'accent' | 'accent2' | 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'invalid') return 'danger';
  if (status === 'warning') return 'warning';
  if (status === 'valid') return 'success';
  return 'muted';
}

function calculateComplexityEstimate(
  architecture: Architecture | null,
  capabilitiesCount: number,
  modulesCount: number,
  endpointsCount: number,
) {
  const baseScoreByLevel: Record<string, number> = {
    low: 22,
    medium: 46,
    high: 68,
    very_high: 86,
  };

  const baseScore = baseScoreByLevel[architecture?.complexity_level ?? ''] ?? 12;
  const score = Math.min(
    100,
    baseScore + capabilitiesCount * 3 + modulesCount * 2 + Math.min(endpointsCount, 12),
  );

  if (score >= 80) {
    return { score, label: 'Enterprise heavy' };
  }
  if (score >= 60) {
    return { score, label: 'Strategic build' };
  }
  if (score >= 35) {
    return { score, label: 'Balanced foundation' };
  }
  return { score, label: 'Lean blueprint' };
}

function StepStatusBadge({ state }: { readonly state: StepVisualState }) {
  const styles: Record<StepVisualState, string> = {
    locked: 'border-white/10 text-[color:var(--muted)]',
    active: 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[color:var(--text)]',
    completed: 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] text-[color:var(--text)]',
    warning: 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[color:var(--warning)]',
    error: 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[color:var(--danger)]',
  };

  const labels: Record<StepVisualState, string> = {
    locked: 'Locked',
    active: 'Active',
    completed: 'Done',
    warning: 'Warning',
    error: 'Error',
  };

  return <Badge className={styles[state]}>{labels[state]}</Badge>;
}

function StepShell({
  step,
  stepState,
  children,
  actions,
}: {
  readonly step: WizardStepDefinition;
  readonly stepState: StepVisualState;
  readonly children: React.ReactNode;
  readonly actions?: React.ReactNode;
}) {
  return (
    <Card className="relative min-h-[40rem] p-0">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_30%)]" />
      <div className="relative space-y-8 p-6 md:p-8">
        <div className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr] xl:items-start">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[color:var(--muted)]">
              {step.eyebrow}
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-[color:var(--text)]">{step.title}</h2>
            <p className="mt-3 max-w-xl text-sm leading-7 text-[color:var(--muted)]">{step.description}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Step state</p>
              <StepStatusBadge state={stepState} />
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                The wizard keeps the current step visible while the topology and validation state remain synchronized.
              </p>
            </div>
            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.22em] text-[color:var(--muted)]">Visual control</p>
              <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">
                Each section carries the same contract-safe flow, but now sits inside a more layered engineering surface.
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-6">{children}</div>

        {actions ? <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-6">{actions}</div> : null}
      </div>
    </Card>
  );
}

function PreviewRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const pending = value === 'pending';
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span className={pending ? 'text-[color:var(--muted)]' : 'font-semibold text-[color:var(--text)]'}>{value}</span>
    </div>
  );
}

function SelectionGroup({
  title,
  description,
  children,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="relative space-y-4 rounded-[var(--radius-xl)] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.07),rgba(255,255,255,0.03))] p-5 md:p-6">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_8%,transparent),transparent_34%)]" />
      <div>
        <p className="relative text-lg font-semibold text-[color:var(--text)]">{title}</p>
        <p className="relative mt-2 text-sm leading-6 text-[color:var(--muted)]">{description}</p>
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function ReviewDisclosure({
  title,
  description,
  children,
  defaultOpen = false,
}: {
  readonly title: string;
  readonly description: string;
  readonly children: React.ReactNode;
  readonly defaultOpen?: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-[color:var(--text)]">{title}</h3>
        <p className="text-sm leading-6 text-[color:var(--muted)]">{description}</p>
      </div>
      <details open={defaultOpen} className="mt-4">
        <summary
          aria-label={title}
          className="focus-ring cursor-pointer list-none rounded-xl text-xs font-semibold uppercase tracking-[0.22em] text-[color:var(--muted)]"
        >
          Toggle section
        </summary>
        <div className="mt-4">{children}</div>
      </details>
    </div>
  );
}

export default function WizardPage() {
  const router = useRouter();
  const languagesQuery = useLanguages();
  const runtimesQuery = useRuntimes();
  const modulesQuery = useBusinessModules();
  const endpointsQuery = useEndpoints();
  const addToast = useUiStore((state) => state.addToast);

  const [currentStepId, setCurrentStepId] = useState<WizardStepId>('technology_path');
  const [languageId, setLanguageId] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [frameworkId, setFrameworkId] = useState('');
  const [architectureId, setArchitectureId] = useState('');
  const [archetypeId, setArchetypeId] = useState('');
  const [capabilityIds, setCapabilityIds] = useState<string[]>([]);
  const [businessModuleIds, setBusinessModuleIds] = useState<string[]>([]);
  const [endpointIds, setEndpointIds] = useState<string[]>([]);
  const [infrastructureComponentIds, setInfrastructureComponentIds] = useState<string[]>([]);
  const [projectName, setProjectName] = useState('ldcn-enterprise-app');
  const [locale, setLocale] = useState<(typeof LOCALE_OPTIONS)[number]>('pt-BR');
  const [generationMode, setGenerationMode] = useState<(typeof GENERATION_MODE_OPTIONS)[number]['value']>('local_build_90');
  const [showAdvancedCapabilities, setShowAdvancedCapabilities] = useState(false);
  const [openEndpointModules, setOpenEndpointModules] = useState<string[]>([]);
  const lastInfrastructureSelectionKey = useRef<string | null>(null);

  const languageProfileQuery = useLanguageProfile(languageId || null);
  const languageFrameworksQuery = useLanguageFrameworks(languageId || null);
  const languageArchitecturesQuery = useLanguageArchitectures(languageId || null);
  const languageArchetypesQuery = useLanguageArchetypes(languageId || null);
  const languageCapabilitiesQuery = useLanguageCapabilities(languageId || null);
  const languageRecommendationsQuery = useLanguageRecommendations(languageId || null);
  const infrastructureComponentsQuery = useInfrastructureComponents();
  const blueprintPreviewMutation = useBlueprintPreview();
  const promptMasterPreviewMutation = usePromptMasterPreview();
  const gatekeeperPreviewMutation = useGatekeeperPreview();
  const saveProjectMutation = useSaveProjectFromWizard();

  const selectedLanguage = useMemo(
    () => (languagesQuery.data ?? []).find((item) => item.id === languageId) ?? null,
    [languageId, languagesQuery.data],
  );
  const selectedLanguageProfile = languageProfileQuery.data ?? null;
  const selectedRuntime = useMemo(
    () => (runtimesQuery.data ?? []).find((item) => item.id === runtimeId) ?? null,
    [runtimeId, runtimesQuery.data],
  );
  const availableRuntimes = useMemo(
    () => (runtimesQuery.data ?? []).filter((item) => item.language_id === languageId),
    [languageId, runtimesQuery.data],
  );
  const availableFrameworks = useMemo(
    () =>
      (languageFrameworksQuery.data ?? []).filter(
        (item) => !runtimeId || item.runtime_id === runtimeId,
      ),
    [languageFrameworksQuery.data, runtimeId],
  );
  const selectedFramework = useMemo(
    () => availableFrameworks.find((item) => item.id === frameworkId) ?? null,
    [availableFrameworks, frameworkId],
  );
  const frameworkSpecialistProfileQuery = useFrameworkSpecialistProfile(frameworkId || null);
  const frameworkRecommendationsQuery = useFrameworkRecommendations(frameworkId || null);
  const frameworkReadinessQuery = useFrameworkReadiness(frameworkId || null);
  const selectedFrameworkSpecialistProfile = frameworkSpecialistProfileQuery.data ?? null;
  const availableArchitectures = useMemo(
    () =>
      (languageArchitecturesQuery.data ?? []).filter(
        (item) => !frameworkId || item.supported_frameworks.some((id) => id === frameworkId),
      ),
    [frameworkId, languageArchitecturesQuery.data],
  );
  const selectedArchitecture = useMemo(
    () => availableArchitectures.find((item) => item.id === architectureId) ?? null,
    [architectureId, availableArchitectures],
  );
  const filteredArchetypes = useMemo(
    () =>
      (languageArchetypesQuery.data ?? []).filter(
        (item) => !architectureId || item.supported_architectures.some((id) => id === architectureId),
      ),
    [architectureId, languageArchetypesQuery.data],
  );
  const selectedArchetype = useMemo(
    () => filteredArchetypes.find((item) => item.id === archetypeId) ?? null,
    [archetypeId, filteredArchetypes],
  );
  const availableCapabilities = useMemo(
    () =>
      (languageCapabilitiesQuery.data ?? []).filter(
        (item) =>
          (!frameworkId || item.supported_frameworks.some((id) => id === frameworkId)) &&
          (!architectureId || item.architecture_ids.some((id) => id === architectureId)),
      ),
    [architectureId, frameworkId, languageCapabilitiesQuery.data],
  );
  const availableModules = useMemo(
    () =>
      (modulesQuery.data ?? []).filter(
        (item) => !frameworkId || item.supported_frameworks.some((id) => id === frameworkId),
      ),
    [frameworkId, modulesQuery.data],
  );
  const infrastructureRecommendationPayload = useMemo<InfrastructureRecommendationPayload | null>(() => {
    if (!languageId || !frameworkId || !architectureId || !archetypeId) {
      return null;
    }

    return {
      language_id: languageId,
      framework_id: frameworkId,
      architecture_id: architectureId,
      archetype_id: archetypeId,
      capability_ids: capabilityIds,
      architecture_level: selectedArchitecture?.complexity_level ?? 'unknown',
    };
  }, [architectureId, archetypeId, capabilityIds, frameworkId, languageId, selectedArchitecture?.complexity_level]);
  const infrastructureRecommendationsQuery = useInfrastructureRecommendations(infrastructureRecommendationPayload);
  const infrastructureRecommendations = infrastructureRecommendationsQuery.data ?? null;
  const templateSelectionPayload = useMemo<Partial<ValidateSelectionPayload> | null>(() => {
    if (!languageId || !frameworkId || !architectureId || !archetypeId) {
      return null;
    }

    return {
      language_id: languageId,
      framework_id: frameworkId,
      architecture_id: architectureId,
      archetype_id: archetypeId,
      capability_ids: capabilityIds,
    };
  }, [architectureId, archetypeId, capabilityIds, frameworkId, languageId]);
  const recommendedTemplatesQuery = useRecommendedTemplates(templateSelectionPayload);
  const recommendedSkillsQuery = useRecommendedSkills(templateSelectionPayload);
  const compatibleTemplateRecommendations = useMemo(
    () =>
      (recommendedTemplatesQuery.data?.recommendations ?? [])
        .map((template, index) => ({
          template,
          compatibility: recommendedTemplatesQuery.data?.compatibility[index] ?? null,
        }))
        .filter((item) => item.compatibility?.compatible),
    [recommendedTemplatesQuery.data],
  );
  const backendBlueprint = blueprintPreviewMutation.data ?? null;
  const dependencyGraphPayload = useMemo<DependencyGraphPayload | null>(() => {
    if (!languageId || !frameworkId || !architectureId) {
      return null;
    }

    return {
      language_id: languageId,
      framework_id: frameworkId,
      architecture_id: architectureId,
      capability_ids: capabilityIds,
      infrastructure_ids: infrastructureComponentIds,
      archetype_id: archetypeId || null,
    };
  }, [architectureId, archetypeId, capabilityIds, frameworkId, infrastructureComponentIds, languageId]);
  const architecturalGraphPayload = useMemo(() => {
    if (!dependencyGraphPayload) return null;
    return {
      language_id: dependencyGraphPayload.language_id,
      framework_id: dependencyGraphPayload.framework_id,
      architecture_id: dependencyGraphPayload.architecture_id,
      capability_ids: dependencyGraphPayload.capability_ids,
      infrastructure_ids: dependencyGraphPayload.infrastructure_ids,
      business_module_ids: businessModuleIds,
    };
  }, [businessModuleIds, dependencyGraphPayload]);
  const dependencyGraphQuery = useDependencyGraph(dependencyGraphPayload);
  const impactAnalysisQuery = useImpactAnalysis(dependencyGraphPayload);
  const readinessAnalysisQuery = useReadinessAnalysis(dependencyGraphPayload);
  const riskAnalysisQuery = useRiskAnalysis(dependencyGraphPayload);
  const engineeringReadinessQuery = useEngineeringReadiness(dependencyGraphPayload);
  const teamProfileQuery = useTeamProfile(dependencyGraphPayload);
  const deliveryEstimateQuery = useDeliveryEstimate(dependencyGraphPayload);
  const dependencyGraphSnapshot = dependencyGraphQuery.data ?? backendBlueprint?.dependency_graph_snapshot ?? null;
  const dependencyImpact = impactAnalysisQuery.data ?? dependencyGraphSnapshot?.impact_profile ?? null;
  const dependencyReadiness = readinessAnalysisQuery.data ?? dependencyGraphSnapshot?.readiness_profile ?? null;
  const dependencyRisks = riskAnalysisQuery.data ?? dependencyGraphSnapshot?.risk_profile ?? null;
  const engineeringReadiness = engineeringReadinessQuery.data ?? null;
  const availableEndpoints = useMemo(
    () =>
      (endpointsQuery.data ?? []).filter(
        (item) =>
          (!frameworkId || item.supported_frameworks.some((id) => id === frameworkId)) &&
          (!architectureId || item.supported_architectures.some((id) => id === architectureId)),
      ),
    [architectureId, endpointsQuery.data, frameworkId],
  );

  const recommendedCapabilityIds = useMemo(
    () =>
      new Set([
        ...(selectedArchetype?.default_capabilities ?? []),
        ...(selectedArchitecture?.recommended_capabilities ?? []),
      ]),
    [selectedArchitecture?.recommended_capabilities, selectedArchetype?.default_capabilities],
  );

  const recommendedCapabilities = useMemo(
    () => availableCapabilities.filter((item) => recommendedCapabilityIds.has(item.id)),
    [availableCapabilities, recommendedCapabilityIds],
  );

  const advancedCapabilities = useMemo(
    () => availableCapabilities.filter((item) => !recommendedCapabilityIds.has(item.id)),
    [availableCapabilities, recommendedCapabilityIds],
  );

  const groupedAdvancedCapabilities = useMemo(() => {
    const groups = new Map<string, Capability[]>();
    for (const capability of advancedCapabilities) {
      const currentGroup = groups.get(capability.category) ?? [];
      currentGroup.push(capability);
      groups.set(capability.category, currentGroup);
    }
    return [...groups.entries()];
  }, [advancedCapabilities]);

  const recommendedModuleIds = useMemo(
    () => new Set(selectedArchetype?.recommended_business_modules ?? []),
    [selectedArchetype?.recommended_business_modules],
  );

  const sortedModules = useMemo(
    () =>
      [...availableModules].sort((left, right) => {
        const leftRecommended = recommendedModuleIds.has(left.id) ? 0 : 1;
        const rightRecommended = recommendedModuleIds.has(right.id) ? 0 : 1;
        if (leftRecommended !== rightRecommended) return leftRecommended - rightRecommended;
        return left.name.localeCompare(right.name);
      }),
    [availableModules, recommendedModuleIds],
  );

  const groupedModules = useMemo(() => {
    const groups = new Map<string, BusinessModule[]>();
    for (const module of sortedModules) {
      const currentGroup = groups.get(module.category) ?? [];
      currentGroup.push(module);
      groups.set(module.category, currentGroup);
    }
    return [...groups.entries()];
  }, [sortedModules]);

  const endpointsBySelectedModule = useMemo(() => {
    const grouped = new Map<string, RegistryEndpoint[]>();
    for (const endpoint of availableEndpoints) {
      if (!endpoint.business_module_id || !businessModuleIds.includes(endpoint.business_module_id)) {
        continue;
      }
      const currentGroup = grouped.get(endpoint.business_module_id) ?? [];
      currentGroup.push(endpoint);
      grouped.set(endpoint.business_module_id, currentGroup);
    }
    return grouped;
  }, [availableEndpoints, businessModuleIds]);

  const selectedModules = useMemo(
    () => availableModules.filter((item) => businessModuleIds.includes(item.id)),
    [availableModules, businessModuleIds],
  );
  const selectedInfrastructureComponents = useMemo(
    () => infrastructureComponentsQuery.components.filter((item) => infrastructureComponentIds.includes(item.id)),
    [infrastructureComponentIds, infrastructureComponentsQuery.components],
  );
  const infrastructureComponentNameById = useMemo(
    () => new Map(infrastructureComponentsQuery.components.map((component) => [component.id, component.name])),
    [infrastructureComponentsQuery.components],
  );

  useEffect(() => {
    if (!infrastructureRecommendationPayload || !infrastructureRecommendations) {
      return;
    }

    const selectionKey = JSON.stringify(infrastructureRecommendationPayload);
    if (lastInfrastructureSelectionKey.current === selectionKey) {
      return;
    }

    const recommendedIds = [
      ...infrastructureRecommendations.required,
      ...infrastructureRecommendations.recommended,
    ];

    setInfrastructureComponentIds((current) => {
      const currentKnown = current.filter((id) => infrastructureComponentsQuery.components.some((component) => component.id === id));
      return [...new Set([...currentKnown, ...recommendedIds])];
    });
    lastInfrastructureSelectionKey.current = selectionKey;
  }, [
    infrastructureComponentsQuery.components,
    infrastructureRecommendationPayload,
    infrastructureRecommendations,
  ]);

  const complexityEstimate = useMemo(
    () => calculateComplexityEstimate(selectedArchitecture, capabilityIds.length, businessModuleIds.length, endpointIds.length),
    [businessModuleIds.length, capabilityIds.length, endpointIds.length, selectedArchitecture],
  );

  const promptMasterDocument = promptMasterPreviewMutation.data ?? null;
  const gatekeeperReport = gatekeeperPreviewMutation.data ?? null;
  const savedProject = saveProjectMutation.data ?? null;

  const validationStatus = blueprintPreviewMutation.isPending
    ? 'loading'
    : blueprintPreviewMutation.isSuccess
      ? backendBlueprint?.validation.valid
        ? 'valid'
        : 'invalid'
      : blueprintPreviewMutation.isError
        ? 'error'
        : 'empty';

  const promptMasterStatus = promptMasterPreviewMutation.isPending
    ? 'loading'
    : promptMasterPreviewMutation.isSuccess
      ? promptMasterDocument?.validation.valid
        ? 'valid'
        : 'invalid'
      : promptMasterPreviewMutation.isError
        ? 'error'
        : 'empty';

  const gatekeeperStatus = gatekeeperPreviewMutation.isPending
    ? 'loading'
    : gatekeeperPreviewMutation.isSuccess
      ? gatekeeperReport?.decision === 'blocked'
        ? 'invalid'
        : gatekeeperReport?.decision === 'approved_with_warnings'
          ? 'warning'
          : 'valid'
      : gatekeeperPreviewMutation.isError
        ? 'error'
        : 'empty';

  const foundationError =
    languagesQuery.error ??
    runtimesQuery.error ??
    modulesQuery.error ??
    endpointsQuery.error ??
    languageProfileQuery.error ??
    languageFrameworksQuery.error ??
    languageArchitecturesQuery.error ??
    languageArchetypesQuery.error ??
    languageCapabilitiesQuery.error ??
    languageRecommendationsQuery.error;

  const isFoundationLoading =
    languagesQuery.isLoading ||
    runtimesQuery.isLoading ||
    modulesQuery.isLoading ||
    endpointsQuery.isLoading ||
    languageProfileQuery.isLoading ||
    (Boolean(languageId) && languageFrameworksQuery.isLoading) ||
    (Boolean(languageId) && (languageArchitecturesQuery.isLoading || languageArchetypesQuery.isLoading || languageCapabilitiesQuery.isLoading || languageRecommendationsQuery.isLoading));

  const technologyPathComplete = Boolean(languageId && runtimeId && frameworkId);
  const architectureComplete = Boolean(technologyPathComplete && architectureId);
  const projectTypeComplete = Boolean(architectureComplete && archetypeId);
  const capabilitiesComplete = Boolean(projectTypeComplete && (capabilityIds.length > 0 || availableCapabilities.length === 0));
  const modulesComplete = Boolean(capabilitiesComplete && businessModuleIds.length > 0);
  const endpointsComplete = Boolean(modulesComplete);

  const stepAvailability: Record<WizardStepId, boolean> = {
    technology_path: true,
    architecture: technologyPathComplete,
    project_type: architectureComplete,
    capabilities: projectTypeComplete,
    business_modules: capabilitiesComplete,
    endpoints: modulesComplete,
    blueprint_review: endpointsComplete,
  };

  useEffect(() => {
    setRuntimeId((current) =>
      current && availableRuntimes.some((item) => item.id === current) ? current : '',
    );
  }, [availableRuntimes]);

  useEffect(() => {
    setFrameworkId((current) =>
      current && availableFrameworks.some((item) => item.id === current) ? current : '',
    );
  }, [availableFrameworks]);

  useEffect(() => {
    setArchitectureId((current) =>
      current && availableArchitectures.some((item) => item.id === current) ? current : '',
    );
  }, [availableArchitectures]);

  useEffect(() => {
    setArchetypeId((current) =>
      current && filteredArchetypes.some((item) => item.id === current) ? current : '',
    );
  }, [filteredArchetypes]);

  useEffect(() => {
    const allowedCapabilityIds = new Set(availableCapabilities.map((item) => item.id));
    setCapabilityIds((current) => current.filter((item) => allowedCapabilityIds.has(item)));
  }, [availableCapabilities]);

  useEffect(() => {
    const allowedModuleIds = new Set(availableModules.map((item) => item.id));
    setBusinessModuleIds((current) => current.filter((item) => allowedModuleIds.has(item)));
  }, [availableModules]);

  useEffect(() => {
    const allowedEndpointIds = new Set(availableEndpoints.map((item) => item.id));
    setEndpointIds((current) => current.filter((item) => allowedEndpointIds.has(item)));
  }, [availableEndpoints]);

  useEffect(() => {
    setOpenEndpointModules((current) => current.filter((item) => businessModuleIds.includes(item)));
  }, [businessModuleIds]);

  useEffect(() => {
    blueprintPreviewMutation.reset();
    promptMasterPreviewMutation.reset();
    gatekeeperPreviewMutation.reset();
    saveProjectMutation.reset();
  }, [
    architectureId,
    archetypeId,
    businessModuleIds,
    capabilityIds,
    endpointIds,
    frameworkId,
    generationMode,
    languageId,
    locale,
    projectName,
    runtimeId,
  ]);

  useEffect(() => {
    if (stepAvailability[currentStepId]) {
      return;
    }

    if (!technologyPathComplete) {
      setCurrentStepId('technology_path');
      return;
    }
    if (!architectureComplete) {
      setCurrentStepId('architecture');
      return;
    }
    if (!projectTypeComplete) {
      setCurrentStepId('project_type');
      return;
    }
    if (!capabilitiesComplete) {
      setCurrentStepId('capabilities');
      return;
    }
    if (!modulesComplete) {
      setCurrentStepId('business_modules');
      return;
    }
    if (!endpointsComplete) {
      setCurrentStepId('endpoints');
      return;
    }
  }, [
    architectureComplete,
    capabilitiesComplete,
    currentStepId,
    endpointsComplete,
    modulesComplete,
    projectTypeComplete,
    stepAvailability,
    technologyPathComplete,
  ]);

  useEffect(() => {
    if (!blueprintPreviewMutation.isSuccess || !backendBlueprint) return;

    addToast({
      tone: backendBlueprint.validation.valid ? 'success' : 'warning',
      title: backendBlueprint.validation.valid ? 'Blueprint preview ready' : 'Blueprint preview returned issues',
      description: backendBlueprint.validation.valid
        ? 'The backend resolved the blueprint with complexity, validation and recommendations.'
        : 'The backend returned explicit blueprint issues and recommendations.',
    });
  }, [addToast, backendBlueprint, blueprintPreviewMutation.isSuccess]);

  useEffect(() => {
    if (!promptMasterPreviewMutation.isSuccess || !promptMasterDocument) return;

    addToast({
      tone: promptMasterDocument.validation.valid ? 'success' : 'warning',
      title: promptMasterDocument.validation.valid
        ? 'Prompt Master preview ready'
        : 'Prompt Master preview returned issues',
      description: promptMasterDocument.validation.valid
        ? 'The Prompt Master contract is ready for inspection and copy.'
        : 'The Prompt Master preserved the blueprint issues and surfaced explicit constraints.',
    });
  }, [addToast, promptMasterDocument, promptMasterPreviewMutation.isSuccess]);

  useEffect(() => {
    if (!gatekeeperPreviewMutation.isSuccess || !gatekeeperReport) return;

    addToast({
      tone:
        gatekeeperReport.decision === 'approved'
          ? 'success'
          : gatekeeperReport.decision === 'approved_with_warnings'
            ? 'warning'
            : 'error',
      title:
        gatekeeperReport.decision === 'approved'
          ? 'Gatekeeper approved'
          : gatekeeperReport.decision === 'approved_with_warnings'
            ? 'Gatekeeper approved with warnings'
            : 'Gatekeeper blocked progression',
      description: gatekeeperReport.summary,
    });
  }, [addToast, gatekeeperPreviewMutation.isSuccess, gatekeeperReport]);

  function goToNextStep(stepId: WizardStepId) {
    const currentIndex = STEP_INDEX_BY_ID[stepId];
    const nextStep = WIZARD_STEPS[currentIndex + 1];
    if (!nextStep) return;
    setCurrentStepId(nextStep.id);
  }

  function goToPreviousStep(stepId: WizardStepId) {
    const currentIndex = STEP_INDEX_BY_ID[stepId];
    const previousStep = WIZARD_STEPS[currentIndex - 1];
    if (!previousStep) return;
    setCurrentStepId(previousStep.id);
  }

  function handleLanguageChange(value: string) {
    setLanguageId(value);
    setRuntimeId('');
    setFrameworkId('');
    setArchitectureId('');
    setArchetypeId('');
    setCapabilityIds([]);
    setBusinessModuleIds([]);
    setEndpointIds([]);
    setInfrastructureComponentIds([]);
    lastInfrastructureSelectionKey.current = null;
  }

  function handleRuntimeChange(value: string) {
    setRuntimeId(value);
    setFrameworkId('');
    setArchitectureId('');
    setArchetypeId('');
    setCapabilityIds([]);
    setBusinessModuleIds([]);
    setEndpointIds([]);
    setInfrastructureComponentIds([]);
    lastInfrastructureSelectionKey.current = null;
  }

  function handleFrameworkChange(value: string) {
    setFrameworkId(value);
    setArchitectureId('');
    setArchetypeId('');
    setCapabilityIds([]);
    setBusinessModuleIds([]);
    setEndpointIds([]);
    setInfrastructureComponentIds([]);
    lastInfrastructureSelectionKey.current = null;
  }

  function handleArchitectureChange(value: string) {
    setArchitectureId(value);
    setArchetypeId('');
    setCapabilityIds([]);
    setBusinessModuleIds([]);
    setEndpointIds([]);
    setInfrastructureComponentIds([]);
    lastInfrastructureSelectionKey.current = null;
  }

  function handleArchetypeChange(value: string) {
    const nextArchetype = filteredArchetypes.find((item) => item.id === value) ?? null;
    const allowedCapabilityIds = new Set(availableCapabilities.map((item) => item.id));
    const allowedModuleIds = new Set(availableModules.map((item) => item.id));
    const allowedEndpointIds = new Set(availableEndpoints.map((item) => item.id));

    setArchetypeId(value);
    setCapabilityIds((nextArchetype?.default_capabilities ?? []).filter((item) => allowedCapabilityIds.has(item)));
    setBusinessModuleIds((nextArchetype?.recommended_business_modules ?? []).filter((item) => allowedModuleIds.has(item)));
    setEndpointIds((nextArchetype?.default_endpoints ?? []).filter((item) => allowedEndpointIds.has(item)));
    setInfrastructureComponentIds([]);
    lastInfrastructureSelectionKey.current = null;
  }

  function toggleEndpointModule(moduleId: string) {
    setOpenEndpointModules((current) =>
      current.includes(moduleId) ? current.filter((item) => item !== moduleId) : [...current, moduleId],
    );
  }

  function selectModuleEndpoints(module: BusinessModule, mode: 'recommended' | 'all') {
    const moduleEndpoints = endpointsBySelectedModule.get(module.id) ?? [];
    const targetEndpointIds =
      mode === 'recommended'
        ? module.default_endpoints.filter((endpointId) => moduleEndpoints.some((item) => item.id === endpointId))
        : moduleEndpoints.map((item) => item.id);

    setEndpointIds((current) => [...new Set([...current, ...targetEndpointIds])]);
  }

  function toggleInfrastructureComponent(componentId: string) {
    setInfrastructureComponentIds((current) => toggleSelection(current, componentId));
  }

  function selectInfrastructureFoundationOnly() {
    if (!infrastructureRecommendations) {
      return;
    }

    setInfrastructureComponentIds([
      ...new Set([...infrastructureRecommendations.required, ...infrastructureRecommendations.recommended]),
    ]);
  }

  function clearInfrastructureSelection() {
    setInfrastructureComponentIds([]);
  }

  function previewCurrentBlueprint() {
    if (!languageId || !runtimeId || !frameworkId || !architectureId || !archetypeId) {
      addToast({
        tone: 'error',
        title: 'Selection incomplete',
        description: 'Choose language, runtime, framework, architecture and archetype before previewing the blueprint.',
      });
      return;
    }

    gatekeeperPreviewMutation.reset();
    promptMasterPreviewMutation.reset();
    blueprintPreviewMutation.mutate({
      project_name: projectName,
      language_id: languageId,
      runtime_id: runtimeId,
      framework_id: frameworkId,
      architecture_id: architectureId,
      archetype_id: archetypeId,
      capability_ids: capabilityIds,
      business_module_ids: businessModuleIds,
      endpoint_ids: endpointIds,
      infrastructure_component_ids: infrastructureComponentIds,
      locale,
      generation_mode: generationMode,
    });
  }

  function previewPromptMaster() {
    if (!backendBlueprint) {
      addToast({
        tone: 'error',
        title: 'Blueprint preview required',
        description: 'Run the blueprint preview first so the Prompt Master can derive a validated technical contract.',
      });
      return;
    }

    gatekeeperPreviewMutation.reset();
    promptMasterPreviewMutation.mutate({
      blueprint: backendBlueprint,
    });
  }

  function runGatekeeper() {
    if (!backendBlueprint || !promptMasterDocument) {
      addToast({
        tone: 'error',
        title: 'Preview chain incomplete',
        description: 'Build the blueprint and Prompt Master previews before running Gatekeeper.',
      });
      return;
    }

    gatekeeperPreviewMutation.mutate({
      blueprint: backendBlueprint,
      prompt_master: promptMasterDocument,
    });
  }

  async function saveProject() {
    if (!backendBlueprint || !promptMasterDocument || !gatekeeperReport) {
      addToast({
        tone: 'error',
        title: 'Validation chain incomplete',
        description: 'Build the blueprint, Prompt Master and Gatekeeper previews before saving the project.',
      });
      return;
    }

    try {
      const saved = await saveProjectMutation.mutateAsync({
        blueprint: backendBlueprint,
        prompt_master: promptMasterDocument,
        gatekeeper: gatekeeperReport,
      });

      addToast({
        tone: 'success',
        title: 'Project saved',
        description: `${saved.project_name} is now persisted in the backend registry.`,
      });
      router.push(`/projects/${saved.project_id}`);
    } catch (error) {
      addToast({
        tone: 'error',
        title: 'Project save failed',
        description: getApiErrorMessage(
          error,
          'Unable to persist the current wizard selection as a project record.',
        ),
      });
    }
  }

  async function copyPromptMaster() {
    if (!promptMasterDocument) {
      addToast({
        tone: 'error',
        title: 'Prompt Master unavailable',
        description: 'Build the Prompt Master preview before copying it.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(promptMasterDocument.compiled_prompt);
      addToast({
        tone: 'success',
        title: 'Prompt Master copied',
        description: 'The compiled technical prompt was copied to the clipboard.',
      });
    } catch {
      addToast({
        tone: 'error',
        title: 'Copy failed',
        description: 'Clipboard access is unavailable in this environment.',
      });
    }
  }

  function getStepState(stepId: WizardStepId): StepVisualState {
    if (stepId === 'blueprint_review' && gatekeeperReport?.decision === 'blocked') {
      return 'error';
    }

    if (stepId === 'blueprint_review' && gatekeeperReport?.decision === 'approved_with_warnings') {
      return 'warning';
    }

    if (stepId === 'blueprint_review' && gatekeeperPreviewMutation.isError) {
      return 'error';
    }

    if (stepId === 'blueprint_review' && promptMasterDocument && !promptMasterDocument.validation.valid) {
      return promptMasterDocument.validation.errors.length ? 'error' : 'warning';
    }

    if (stepId === 'blueprint_review' && promptMasterPreviewMutation.isError) {
      return 'error';
    }

    if (stepId === 'blueprint_review' && backendBlueprint && !backendBlueprint.validation.valid) {
      return backendBlueprint.validation.errors.length ? 'error' : 'warning';
    }

    if (stepId === 'blueprint_review' && blueprintPreviewMutation.isError) {
      return 'error';
    }

    if (stepId === currentStepId) {
      return 'active';
    }

    if (!stepAvailability[stepId] && stepId !== 'technology_path') {
      return 'locked';
    }

    const completedStates: Record<WizardStepId, boolean> = {
      technology_path: technologyPathComplete,
      architecture: architectureComplete,
      project_type: projectTypeComplete,
      capabilities: capabilitiesComplete,
      business_modules: modulesComplete,
      endpoints: endpointsComplete,
      blueprint_review: Boolean(
        backendBlueprint?.validation.valid ||
          promptMasterDocument?.validation.valid ||
          gatekeeperReport?.decision === 'approved' ||
          gatekeeperReport?.decision === 'approved_with_warnings',
      ),
    };

    return completedStates[stepId] ? 'completed' : 'locked';
  }

  const currentStep = WIZARD_STEPS[STEP_INDEX_BY_ID[currentStepId]];

  const previewSummary = {
    language: backendBlueprint?.technology_graph.language.name ?? selectedLanguageProfile?.name ?? selectedLanguage?.name ?? 'pending',
    runtime: backendBlueprint?.technology_graph.runtime.name ?? selectedRuntime?.name ?? 'pending',
    framework: backendBlueprint?.technology_graph.framework.name ?? selectedFramework?.name ?? 'pending',
    architecture: backendBlueprint?.technology_graph.architecture.name ?? selectedArchitecture?.name ?? 'pending',
    archetype: backendBlueprint?.archetype_profile.name ?? selectedArchetype?.name ?? 'pending',
    capabilities: backendBlueprint ? `${backendBlueprint.capabilities.length} selected` : capabilityIds.length > 0 ? `${capabilityIds.length} selected` : 'pending',
    modules: backendBlueprint ? `${backendBlueprint.business_modules.length} selected` : businessModuleIds.length > 0 ? `${businessModuleIds.length} selected` : 'pending',
    endpoints: backendBlueprint
      ? `${backendBlueprint.endpoints.length} selected`
      : endpointIds.length > 0
        ? `${endpointIds.length} selected`
        : modulesComplete
          ? 'none selected'
          : 'pending',
  };

  const journeyCompletion = [
    technologyPathComplete,
    architectureComplete,
    projectTypeComplete,
    capabilitiesComplete,
    modulesComplete,
    endpointsComplete,
    Boolean(backendBlueprint?.validation.valid),
    Boolean(promptMasterDocument?.validation.valid),
    Boolean(gatekeeperReport?.decision === 'approved' || gatekeeperReport?.decision === 'approved_with_warnings'),
  ].filter(Boolean).length;

  const journeyScore = Math.round((journeyCompletion / 9) * 100);
  const journeyTone =
    gatekeeperReport?.decision === 'blocked' || gatekeeperStatus === 'invalid'
      ? 'danger'
      : gatekeeperReport?.decision === 'approved_with_warnings' || gatekeeperStatus === 'warning'
        ? 'warning'
        : endpointsComplete
          ? 'success'
          : 'accent';

  const architectureGraphNodes = [
    {
      label: 'Language',
      value: previewSummary.language,
      detail:
        selectedLanguageProfile?.summary ??
        (selectedLanguage ? `${selectedLanguage.ecosystem} ecosystem` : 'Select a language to begin'),
      tone: selectedLanguageProfile?.ecosystem.includes('JVM')
        ? 'accent'
        : selectedLanguageProfile?.ecosystem.includes('Python')
          ? 'accent2'
          : selectedLanguageProfile
            ? 'success'
            : 'muted',
    },
    {
      label: 'Runtime',
      value: previewSummary.runtime,
      detail: selectedRuntime?.performance_profile ?? 'runtime profile',
      tone: 'accent2',
    },
    {
      label: 'Framework',
      value: previewSummary.framework,
      detail: selectedFramework?.framework_type ?? 'framework topology',
      tone: 'success',
    },
    {
      label: 'Architecture',
      value: previewSummary.architecture,
      detail: selectedArchitecture?.scalability_profile ?? 'architecture profile',
      tone: 'muted',
    },
  ] as const;

  const frameworkPresenceMessage = useMemo(() => {
    if (!selectedFrameworkSpecialistProfile) {
      return selectedLanguageProfile
        ? `${selectedLanguageProfile.name} framework guidance ready`
        : 'Reserved presence layer watching the engineering shell without executing generation or voice.';
    }

    if (frameworkId === 'spring_boot') return 'Spring Boot specialist profile loaded';
    if (frameworkId === 'nestjs') return 'NestJS architecture guidance ready';
    if (frameworkId === 'fastapi') return 'FastAPI AI service profile ready';

    return `${selectedFrameworkSpecialistProfile.framework_name} specialist profile ready`;
  }, [frameworkId, selectedFrameworkSpecialistProfile, selectedLanguageProfile?.name]);
  const infrastructurePresenceMessage = useMemo(() => {
    if (!infrastructureRecommendations) {
      return 'Infrastructure profile ready';
    }

    if (frameworkId === 'spring_boot' && architectureId === 'microservices') {
      return 'Spring Boot enterprise baseline detected';
    }

    if (frameworkId === 'fastapi' && (capabilityIds.includes('ai_chat') || capabilityIds.includes('rag'))) {
      return 'FastAPI AI infra recommendations available';
    }

    return 'Infrastructure profile ready';
  }, [architectureId, capabilityIds, frameworkId, infrastructureRecommendations]);
  const dependencyPresenceMessage = useMemo(() => {
    if (!dependencyGraphSnapshot) {
      return 'Dependency propagation active';
    }

    if (capabilityIds.includes('ai_chat') || capabilityIds.includes('rag')) {
      return 'AI infrastructure mutation detected';
    }

    if (architectureId === 'microservices') {
      return 'Microservices complexity increased';
    }

    if ((dependencyReadiness?.score ?? dependencyGraphSnapshot.readiness_profile.score) > 0) {
      return 'Readiness score recalculated';
    }

    return 'Operational burden increased';
  }, [architectureId, capabilityIds, dependencyGraphSnapshot, dependencyReadiness?.score]);
  const engineeringPresenceMessage = useMemo(() => {
    if (!engineeringReadiness) {
      return null;
    }

    if (engineeringReadiness.team_recommendation.required_seniority === 'senior_plus' && engineeringReadiness.team_size >= 7) {
      return 'Enterprise team profile detected';
    }

    if (architectureId === 'microservices') {
      return 'Microservices require platform maturity';
    }

    if (engineeringReadiness.operational_burden.level === 'high' || engineeringReadiness.operational_burden.level === 'enterprise') {
      return 'Operational burden increased';
    }

    return 'Production readiness recalculated';
  }, [architectureId, engineeringReadiness]);
  const topologyPresenceMessage = useMemo(() => {
    if (!dependencyGraphPayload) return null;
    if (infrastructureComponentIds.includes('kafka')) return 'Kafka node increases operational burden';
    if (infrastructureComponentIds.includes('kubernetes')) return 'Kubernetes ownership requires SRE';
    if (capabilityIds.includes('payments')) return 'Payment edge requires audit trail';
    if (dependencyRisks?.issues.length) return 'Risk zones recalculated';
    if (dependencyGraphSnapshot?.propagation.required_node_ids.length) return 'Dependency propagation visualized';
    if (architecturalGraphPayload) return 'Architectural graph synchronized';
    if (dependencyGraphSnapshot) return 'Runtime topology synchronized';
    if (infrastructureComponentIds.length) return 'Operational topology active';
    if (architectureId) return 'Architecture graph updated';
    return 'Operational topology active';
  }, [architectureId, architecturalGraphPayload, capabilityIds, dependencyGraphPayload, dependencyGraphSnapshot, dependencyGraphSnapshot?.propagation.required_node_ids.length, dependencyRisks?.issues.length, infrastructureComponentIds, infrastructureComponentIds.length]);

  const ldcnContext = useMemo(
    () =>
      ({
        route: '/wizard',
        page_title: selectedLanguageProfile ? `${selectedLanguageProfile.name} domain journey` : 'Architecture Journey',
        current_phase: currentStep.title,
        pipeline: {
          route: '/wizard',
          phase: currentStep.title,
          status:
            gatekeeperReport?.decision === 'blocked'
              ? 'blocked'
              : gatekeeperReport?.decision === 'approved_with_warnings'
                ? 'degraded'
                : gatekeeperReport?.decision === 'approved'
                  ? 'ready'
                  : 'previewing',
          readiness_label:
            gatekeeperReport?.decision === 'blocked'
              ? 'Gatekeeper blocked progression'
              : gatekeeperReport?.decision === 'approved_with_warnings'
                ? 'Approved with warnings'
              : gatekeeperReport?.decision === 'approved'
                  ? 'Approved and ready'
                  : dependencyGraphSnapshot
                    ? topologyPresenceMessage ?? engineeringPresenceMessage ?? dependencyPresenceMessage
                    : infrastructureRecommendations
                    ? infrastructurePresenceMessage
                  : selectedFrameworkSpecialistProfile
                    ? frameworkPresenceMessage
                    : selectedLanguageProfile
                      ? `Observing ${selectedLanguageProfile.name} ecosystem`
                      : 'Wizard topology under observation',
          detail:
            gatekeeperReport?.summary ??
            selectedFrameworkSpecialistProfile?.summary ??
            'The wizard is shaping the blueprint, Prompt Master, and Gatekeeper flow.',
        },
        status:
          gatekeeperReport?.decision === 'blocked'
            ? 'blocked'
            : gatekeeperReport?.decision === 'approved_with_warnings'
              ? 'warning'
              : currentStepId === 'blueprint_review'
                ? 'thinking'
                : 'observing',
        summary:
          gatekeeperReport?.summary ??
          (selectedLanguageProfile
            ? `${selectedLanguageProfile.summary} ${
                dependencyGraphSnapshot
                  ? `${topologyPresenceMessage ?? engineeringPresenceMessage ?? dependencyPresenceMessage}.`
                  : infrastructureRecommendations
                    ? 'Infrastructure profile is ready in the side rail.'
                  : selectedFrameworkSpecialistProfile?.summary
                    ? 'Framework specialist guidance is available in the side rail.'
                    : 'Framework recommendations are available in the side rail.'
              }`
            : 'Reserved presence layer watching the engineering shell without executing generation or voice.'),
        suggestions: [
          {
            id: 'ldcn-wizard-review',
            action: 'review_blueprint',
            label: 'Review blueprint',
            summary: 'Reserved for future blueprint explanation on the wizard surface.',
            reserved: true,
          },
          {
            id: 'ldcn-wizard-gatekeeper',
            action: 'inspect_gatekeeper',
            label: 'Inspect gatekeeper',
            summary: 'Reserved for future governed validation insight.',
            reserved: true,
          },
          {
            id: 'ldcn-wizard-palette',
            action: 'open_command_palette',
            label: 'Open command palette',
            summary: 'Reserved for future command palette entry points.',
            reserved: true,
          },
        ],
      }) as const,
    [
      currentStep.title,
      currentStepId,
      gatekeeperReport?.decision,
      gatekeeperReport?.summary,
      frameworkPresenceMessage,
      dependencyGraphSnapshot,
      dependencyPresenceMessage,
      engineeringPresenceMessage,
      topologyPresenceMessage,
      selectedLanguageProfile?.ecosystem,
      selectedLanguageProfile?.name,
      selectedLanguageProfile?.summary,
      selectedFrameworkSpecialistProfile?.summary,
      infrastructureRecommendations,
    ],
  );

  useEffect(() => {
    useLDCNStore.getState().setPresenceState(ldcnContext.status);
    useLDCNStore.getState().setContext(ldcnContext);
  }, [ldcnContext]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Wizard"
        description="Architecture journey for real engineering decisions, with a visible technology graph and governed progression."
      />

      <section className="cinematic-surface relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] p-5 md:p-6">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="cinematic-gradient-motion pointer-events-none absolute inset-0" />
        <div className="relative grid gap-5 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div className="grid gap-4">
            <div className="max-w-3xl">
              <Badge className="w-fit border-[color-mix(in_srgb,var(--accent)_26%,transparent)] bg-white/5">
                Technology graph explorer
              </Badge>
              <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text)] md:text-4xl">
                Design the system like a living architecture.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted)] md:text-base">
                Language, runtime, framework, architecture, and archetype now change the runtime surface of the Wizard so the user can see the system they are building.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">Technology graph</Badge>
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">Architecture profile</Badge>
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">Complexity profile</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SurfaceLabel
                icon={<SurfaceIcon icon={Sparkles} />}
                label="Language"
                value={previewSummary.language}
                detail={selectedLanguage ? selectedLanguage.ecosystem : 'No language selected'}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Activity} />}
                label="Runtime"
                value={previewSummary.runtime}
                detail={selectedRuntime?.performance_profile ?? 'Pending runtime profile'}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Database} />}
                label="Framework"
                value={previewSummary.framework}
                detail={selectedFramework?.framework_type ?? 'Framework topology'}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Layers3} />}
                label="Architecture"
                value={previewSummary.architecture}
                detail={selectedArchitecture?.scalability_profile ?? 'Architecture profile'}
              />
            </div>

            <OperationalRail
              title="Journey intelligence"
              items={[
                {
                  label: 'Journey',
                  value: `${journeyScore}%`,
                  detail: currentStep.title,
                  tone: journeyTone,
                },
                {
                  label: 'Complexity',
                  value: String(backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score),
                  detail: backendBlueprint?.complexity_profile.risk_level ?? complexityEstimate.label,
                  tone: 'accent2',
                },
                {
                  label: 'Validation',
                  value: validationStatus === 'valid' ? 'Ready' : validationStatus === 'invalid' ? 'Attention' : validationStatus,
                  detail: 'Blueprint preview surface',
                  tone: validationStatus === 'valid' ? 'success' : validationStatus === 'invalid' ? 'warning' : 'muted',
                },
                {
                  label: 'Gatekeeper',
                  value: gatekeeperStatus === 'valid' ? 'Approved' : gatekeeperStatus === 'warning' ? 'Warnings' : gatekeeperStatus === 'invalid' ? 'Blocked' : gatekeeperStatus,
                  detail: 'Governed progression',
                  tone: gatekeeperToneFromStatus(gatekeeperStatus),
                },
              ]}
            />
          </div>

          <div className="grid gap-4">
            <ArchitectureGraphSurface
              title="Topology surface"
              subtitle="Selecting Java, TypeScript, or Python reshapes the runtime ecosystem and architecture path immediately."
              nodes={architectureGraphNodes}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ReadinessRing
                title="Journey readiness"
                value={journeyScore}
                label={currentStep.title}
                caption="Progress grows as the selected stack moves through the decision cockpit."
                tone={journeyTone}
              />
              <StackEcosystemMap
                title="Stack ecosystem"
                nodes={[
                  {
                    label: 'Archetype',
                    value: previewSummary.archetype,
                    detail: selectedArchetype?.preview_type ?? 'Archetype preview',
                    tone: 'accent',
                  },
                  {
                    label: 'Modules',
                    value: previewSummary.modules,
                    detail: 'Business module grouping',
                    tone: 'accent2',
                  },
                  {
                    label: 'Endpoints',
                    value: previewSummary.endpoints,
                    detail: 'Route ownership and selection',
                    tone: 'success',
                  },
                  {
                    label: 'Locale',
                    value: locale,
                    detail: 'Blueprint locale contract',
                    tone: 'muted',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <SurfaceDivider />

      <div className="grid gap-6 xl:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,1fr)_24rem]">
        <Card className="h-fit p-4 md:p-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
                Progress
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                Move one decision at a time. Locked steps open only after the prior choice is complete.
              </p>
            </div>

            <nav aria-label="Wizard steps">
              <ol className="space-y-2">
                {WIZARD_STEPS.map((step, index) => {
                  const state = getStepState(step.id);
                  const isNavigable = state !== 'locked';
                  return (
                    <li key={step.id}>
                      <button
                        id={createTriggerId(step.id)}
                        type="button"
                        aria-controls={createRegionId(step.id)}
                        aria-current={currentStepId === step.id ? 'step' : undefined}
                        disabled={!isNavigable}
                        onClick={() => isNavigable && setCurrentStepId(step.id)}
                        className={[
                          'focus-ring flex w-full items-start gap-3 rounded-[var(--radius-xl)] border px-3 py-3 text-left transition duration-200',
                          state === 'active'
                            ? 'border-[color-mix(in_srgb,var(--accent)_40%,transparent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]'
                            : 'border-white/10 bg-white/5 hover:bg-white/8',
                          !isNavigable ? 'cursor-not-allowed opacity-55' : '',
                        ].join(' ')}
                      >
                        <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-white/10 text-xs font-semibold text-[color:var(--text)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold text-[color:var(--text)]">{step.title}</span>
                          <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{step.description}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </nav>
          </div>
        </Card>

        <div id={createRegionId(currentStep.id)} aria-labelledby={createTriggerId(currentStep.id)}>
          {isFoundationLoading ? (
            <Card className="space-y-4 p-6">
              <CardLoading className="p-0 shadow-none" />
              <CardLoading className="p-0 shadow-none" />
              <CardLoading className="p-0 shadow-none" />
            </Card>
          ) : foundationError ? (
            <Card className="p-6">
              <PageError
                title="Technology graph unavailable"
                description={getApiErrorMessage(
                  foundationError,
                  'Unable to load the language, runtime or framework registries needed by the wizard.',
                )}
                onRetry={() => {
                  void languagesQuery.refetch();
                  void runtimesQuery.refetch();
                  void modulesQuery.refetch();
                  void endpointsQuery.refetch();
                  void languageFrameworksQuery.refetch();
                  void languageProfileQuery.refetch();
                  void languageArchitecturesQuery.refetch();
                  void languageArchetypesQuery.refetch();
                  void languageCapabilitiesQuery.refetch();
                  void languageRecommendationsQuery.refetch();
                }}
              />
            </Card>
          ) : (languagesQuery.data?.length ?? 0) === 0 ? (
            <EmptyState kind="projects" />
          ) : (
            <>
              {currentStepId === 'technology_path' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('technology_path')}
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!technologyPathComplete}
                        onClick={() => goToNextStep('technology_path')}
                      >
                        Continue to Architecture
                      </Button>
                      <ActionLink href="/projects" variant="secondary">
                        Review projects
                      </ActionLink>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Choose the technology spine"
                    description="The Wizard now starts with the real engineering path. Runtime appears only after a language, and framework appears only after a runtime."
                  >
                    <div className="grid gap-5 xl:grid-cols-3">
                      <SelectField
                        label="1. Language"
                        description="Programming ecosystem."
                        value={languageId}
                        onChange={(event) => handleLanguageChange(event.target.value)}
                      >
                        <option value="">Select a language</option>
                        {(languagesQuery.data ?? []).map((language) => (
                          <option key={language.id} value={language.id}>
                            {language.name}
                          </option>
                        ))}
                      </SelectField>

                      {languageId ? (
                        <SelectField
                          label="2. Runtime"
                          description="Execution environment."
                          value={runtimeId}
                          onChange={(event) => handleRuntimeChange(event.target.value)}
                        >
                          <option value="">Select a runtime</option>
                          {availableRuntimes.map((runtime) => (
                            <option key={runtime.id} value={runtime.id}>
                              {runtime.name}
                            </option>
                          ))}
                        </SelectField>
                      ) : (
                        <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                          Runtime unlocks after selecting a language.
                        </div>
                      )}

                      {runtimeId ? (
                        <SelectField
                          label="3. Framework"
                          description="Delivery framework."
                          value={frameworkId}
                          onChange={(event) => handleFrameworkChange(event.target.value)}
                        >
                          <option value="">Select a framework</option>
                          {availableFrameworks.map((framework) => (
                            <option key={framework.id} value={framework.id}>
                              {framework.name}
                            </option>
                          ))}
                        </SelectField>
                      ) : (
                        <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                          Framework unlocks after selecting a runtime.
                        </div>
                      )}
                    </div>
                  </SelectionGroup>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <SelectionGroup
                      title="Language profile"
                      description="Evaluate ecosystem fit, learning curve, and enterprise readiness."
                    >
                      <div className="space-y-2 text-sm text-[color:var(--muted)]">
                        <p>{selectedLanguageProfile?.summary ?? selectedLanguage?.description ?? 'Select a language to inspect its ecosystem.'}</p>
                        <p>
                          Ecosystem:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.ecosystem ?? selectedLanguage?.ecosystem ?? 'pending'}
                          </span>
                        </p>
                        <p>
                          Primary use cases:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.primary_use_cases.join(', ') || 'pending'}
                          </span>
                        </p>
                        <p>
                          Enterprise score:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.enterprise_score ?? selectedLanguage?.enterprise_score ?? 'pending'}
                          </span>
                        </p>
                        <p>
                          Learning curve:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.learning_curve ?? selectedLanguage?.learning_curve ?? 'pending'}
                          </span>
                        </p>
                        <p>
                          Scalability:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.scalability_profile ?? selectedLanguage?.scalability_profile ?? 'pending'}
                          </span>
                        </p>
                        <p>
                          Frameworks / architectures / capabilities:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile
                              ? `${selectedLanguageProfile.framework_count} / ${selectedLanguageProfile.architecture_count} / ${selectedLanguageProfile.capability_count}`
                              : 'pending'}
                          </span>
                        </p>
                      </div>
                    </SelectionGroup>

                    <FrameworkSpecialistPanel
                      frameworkId={frameworkId || null}
                      frameworkName={selectedFramework?.name ?? null}
                      profile={selectedFrameworkSpecialistProfile}
                      architectures={frameworkRecommendationsQuery.architectures}
                      capabilities={frameworkRecommendationsQuery.capabilities}
                      endpointGroups={frameworkRecommendationsQuery.endpoints}
                      readiness={frameworkReadinessQuery.data ?? selectedFrameworkSpecialistProfile?.readiness_profile ?? null}
                      isLoading={
                        frameworkSpecialistProfileQuery.isLoading ||
                        frameworkRecommendationsQuery.isLoading ||
                        frameworkReadinessQuery.isLoading
                      }
                      errorMessage={
                        frameworkSpecialistProfileQuery.error?.message ??
                        frameworkRecommendationsQuery.error?.message ??
                        frameworkReadinessQuery.error?.message ??
                        null
                      }
                    />
                  </div>
                </StepShell>
              ) : null}

              {currentStepId === 'architecture' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('architecture')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('architecture')}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!architectureComplete}
                        onClick={() => goToNextStep('architecture')}
                      >
                        Continue to Project Type
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Shape the system style"
                    description="Architecture opens only after the framework is chosen so complexity stays grounded in real framework support."
                  >
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,18rem)_1fr]">
                      <SelectField
                        label="4. Architecture"
                        description="Structural pattern."
                        value={architectureId}
                        onChange={(event) => handleArchitectureChange(event.target.value)}
                      >
                        <option value="">Select an architecture</option>
                        {availableArchitectures.map((architecture) => (
                          <option key={architecture.id} value={architecture.id}>
                            {architecture.name}
                          </option>
                        ))}
                      </SelectField>

                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">Architecture profile</p>
                        <p className="mt-3">{selectedArchitecture?.description ?? 'Select an architecture to inspect complexity, scalability, and deployment shape.'}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Complexity</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{formatComplexityLabel(selectedArchitecture?.complexity_level)}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Scalability</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{selectedArchitecture?.scalability_profile ?? 'pending'}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Deployment</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{selectedArchitecture?.deployment_complexity ?? 'pending'}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </SelectionGroup>
                </StepShell>
              ) : null}

              {currentStepId === 'project_type' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('project_type')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('project_type')}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!projectTypeComplete}
                        onClick={() => goToNextStep('project_type')}
                      >
                        Continue to Capabilities
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Choose the project type"
                    description="Archetype comes after architecture so the product shape inherits real structural support."
                  >
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,18rem)_1fr]">
                      <SelectField
                        label="5. Archetype"
                        description="What kind of system you are building."
                        value={archetypeId}
                        onChange={(event) => handleArchetypeChange(event.target.value)}
                      >
                        <option value="">Select an archetype</option>
                        {filteredArchetypes.map((archetype) => (
                          <option key={archetype.id} value={archetype.id}>
                            {archetype.name}
                          </option>
                        ))}
                      </SelectField>

                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">Archetype profile</p>
                        <p className="mt-3">{selectedArchetype?.description ?? 'Select an archetype to see default capabilities, modules, and blueprint direction.'}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge>{selectedArchetype?.category ?? 'pending'}</Badge>
                          <Badge>Preview {selectedArchetype?.preview_type ?? 'pending'}</Badge>
                          <Badge>
                            Complexity {selectedArchetype ? `${selectedArchetype.complexity_range.minimum}-${selectedArchetype.complexity_range.maximum}` : 'pending'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </SelectionGroup>
                </StepShell>
              ) : null}

              {currentStepId === 'capabilities' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('capabilities')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('capabilities')}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!capabilitiesComplete}
                        onClick={() => goToNextStep('capabilities')}
                      >
                        Continue to Business Modules
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Recommended capabilities first"
                    description="Start from the archetype and architecture recommendations. Advanced capabilities stay collapsed until explicitly requested."
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{capabilityIds.length} selected</Badge>
                        <Badge>{recommendedCapabilities.length} recommended</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={showAdvancedCapabilities}
                        aria-controls="advanced-capabilities-region"
                        onClick={() => setShowAdvancedCapabilities((current) => !current)}
                      >
                        {showAdvancedCapabilities ? 'Hide advanced capabilities' : 'View advanced capabilities'}
                      </Button>
                    </div>

                    {recommendedCapabilities.length ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[color:var(--text)]">Recommended for this blueprint</p>
                        <div className="grid gap-3 md:grid-cols-2">
                          {recommendedCapabilities.map((capability) => (
                            <CheckboxField
                              key={capability.id}
                              label={capability.name}
                              description={capability.description}
                              checked={capabilityIds.includes(capability.id)}
                              onChange={() => setCapabilityIds((current) => toggleSelection(current, capability.id))}
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        No recommended capabilities were returned for this combination yet.
                      </div>
                    )}

                    <div
                      id="advanced-capabilities-region"
                      hidden={!showAdvancedCapabilities}
                      className="space-y-4"
                    >
                      {groupedAdvancedCapabilities.map(([category, capabilities]) => (
                        <div key={category} className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
                          <p className="text-sm font-semibold text-[color:var(--text)]">
                            {CAPABILITY_CATEGORY_LABELS[category] ?? category}
                          </p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {capabilities.map((capability) => (
                              <CheckboxField
                                key={capability.id}
                                label={capability.name}
                                description={capability.description}
                                checked={capabilityIds.includes(capability.id)}
                                onChange={() => setCapabilityIds((current) => toggleSelection(current, capability.id))}
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SelectionGroup>
                </StepShell>
              ) : null}

              {currentStepId === 'business_modules' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('business_modules')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('business_modules')}>
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!modulesComplete}
                        onClick={() => goToNextStep('business_modules')}
                      >
                        Continue to Endpoints
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Business modules by domain"
                    description="Recommended modules for the chosen archetype rise to the top, while broader business domains remain grouped for controlled expansion."
                  >
                    <div className="space-y-5">
                      {groupedModules.map(([category, modules]) => (
                        <div key={category} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-semibold text-[color:var(--text)]">
                              {MODULE_CATEGORY_LABELS[category] ?? category}
                            </p>
                            <Badge>{modules.length}</Badge>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {modules.map((module) => (
                              <div key={module.id} className="relative">
                                {recommendedModuleIds.has(module.id) ? (
                                  <Badge className="absolute right-3 top-3 border-[color-mix(in_srgb,var(--accent)_34%,transparent)] text-[color:var(--text)]">
                                    Recommended
                                  </Badge>
                                ) : null}
                                <CheckboxField
                                  label={module.name}
                                  description={module.description}
                                  checked={businessModuleIds.includes(module.id)}
                                  onChange={() => setBusinessModuleIds((current) => toggleSelection(current, module.id))}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </SelectionGroup>

                  <InfrastructureRecommendationsPanel
                    groupedComponents={infrastructureComponentsQuery.grouped}
                    recommendation={infrastructureRecommendations}
                    selectedComponentIds={infrastructureComponentIds}
                    isLoading={infrastructureComponentsQuery.isLoading || infrastructureRecommendationsQuery.isLoading}
                    errorMessage={
                      infrastructureComponentsQuery.error?.message ??
                      infrastructureRecommendationsQuery.error?.message ??
                      null
                    }
                    onToggleComponent={toggleInfrastructureComponent}
                    onSelectFoundation={selectInfrastructureFoundationOnly}
                    onClearSelection={clearInfrastructureSelection}
                  />
                </StepShell>
              ) : null}

              {currentStepId === 'endpoints' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('endpoints')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('endpoints')}>
                        Back
                      </Button>
                      <Button type="button" variant="primary" onClick={() => goToNextStep('endpoints')}>
                        Continue to Blueprint Review
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Endpoints grouped by module"
                    description="Endpoints are hidden until business modules exist. Each module opens as its own accordion and supports recommended or full-batch selection."
                  >
                    {selectedModules.length === 0 ? (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        Select at least one business module to unlock endpoint groups.
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {selectedModules.map((module) => {
                          const moduleEndpoints = endpointsBySelectedModule.get(module.id) ?? [];
                          const isOpen = openEndpointModules.includes(module.id);
                          const accordionRegionId = `endpoint-module-${module.id}`;

                          return (
                            <div key={module.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5">
                              <button
                                type="button"
                                className="focus-ring flex w-full items-center justify-between gap-4 rounded-[var(--radius-xl)] px-5 py-4 text-left"
                                aria-expanded={isOpen}
                                aria-controls={accordionRegionId}
                                onClick={() => toggleEndpointModule(module.id)}
                              >
                                <span>
                                  <span className="block text-sm font-semibold text-[color:var(--text)]">{module.name}</span>
                                  <span className="mt-1 block text-xs text-[color:var(--muted)]">{module.description}</span>
                                </span>
                                <div className="flex items-center gap-2">
                                  <Badge>{moduleEndpoints.length} routes</Badge>
                                  <Badge>{module.default_endpoints.filter((item) => moduleEndpoints.some((endpoint) => endpoint.id === item)).length} recommended</Badge>
                                </div>
                              </button>

                              <div id={accordionRegionId} hidden={!isOpen} className="space-y-4 border-t border-white/10 px-5 py-4">
                                <div className="flex flex-wrap gap-3">
                                  <Button type="button" variant="soft" onClick={() => selectModuleEndpoints(module, 'recommended')}>
                                    Select recommended
                                  </Button>
                                  <Button type="button" variant="secondary" onClick={() => selectModuleEndpoints(module, 'all')}>
                                    Select all in module
                                  </Button>
                                </div>
                                <div className="grid gap-3 md:grid-cols-2">
                                  {moduleEndpoints.map((endpoint) => (
                                    <CheckboxField
                                      key={endpoint.id}
                                      label={`${endpoint.method} ${endpoint.path}`}
                                      description={endpoint.description}
                                      checked={endpointIds.includes(endpoint.id)}
                                      onChange={() => setEndpointIds((current) => toggleSelection(current, endpoint.id))}
                                    />
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </SelectionGroup>
                </StepShell>
              ) : null}

              {currentStepId === 'blueprint_review' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('blueprint_review')}
                  actions={
                    <>
                      <Button type="button" variant="secondary" onClick={() => goToPreviousStep('blueprint_review')}>
                        Back
                      </Button>
                      <Button type="button" variant="primary" onClick={previewCurrentBlueprint} disabled={blueprintPreviewMutation.isPending}>
                        {blueprintPreviewMutation.isPending ? <ButtonLoading label="Building blueprint preview" /> : 'Preview blueprint'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={previewPromptMaster}
                        disabled={!backendBlueprint || promptMasterPreviewMutation.isPending}
                      >
                        {promptMasterPreviewMutation.isPending ? <ButtonLoading label="Building Prompt Master" /> : 'Preview Prompt Master'}
                      </Button>
                      <Button
                        type="button"
                        variant="soft"
                        onClick={() => void copyPromptMaster()}
                        disabled={!promptMasterDocument}
                      >
                        Copy Prompt Master
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={runGatekeeper}
                        disabled={!promptMasterDocument || gatekeeperPreviewMutation.isPending}
                      >
                        {gatekeeperPreviewMutation.isPending ? <ButtonLoading label="Running Gatekeeper" /> : 'Run Gatekeeper'}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        onClick={saveProject}
                        disabled={!gatekeeperReport || saveProjectMutation.isPending}
                      >
                        {saveProjectMutation.isPending ? <ButtonLoading label="Saving project" /> : 'Save Project'}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title="Blueprint review"
                    description="Build a normalized backend preview with technology graph, complexity, validation and explicit recommendations before any future generation layer exists."
                  >
                    <div className="grid gap-4 lg:grid-cols-3">
                      <TextField
                        label="Project name"
                        description="Human-readable blueprint label."
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                      />
                      <SelectField
                        label="Locale"
                        description="Output locale stored in the blueprint."
                        value={locale}
                        onChange={(event) => setLocale(event.target.value as (typeof LOCALE_OPTIONS)[number])}
                      >
                        {LOCALE_OPTIONS.map((localeOption) => (
                          <option key={localeOption} value={localeOption}>
                            {localeOption}
                          </option>
                        ))}
                      </SelectField>
                      <SelectField
                        label="Generation mode"
                        description="Planning-only mode for future phases."
                        value={generationMode}
                        onChange={(event) => setGenerationMode(event.target.value as (typeof GENERATION_MODE_OPTIONS)[number]['value'])}
                      >
                        {GENERATION_MODE_OPTIONS.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </SelectField>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">Complexity estimate</p>
                        <p className="mt-3 text-3xl font-semibold text-[color:var(--text)]">
                          {backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}
                        </p>
                        <p className="mt-2">
                          {backendBlueprint?.complexity_profile.risk_level ?? complexityEstimate.label}
                        </p>
                        <p className="mt-4">
                          Architecture complexity:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {formatComplexityLabel(
                              backendBlueprint?.technology_graph.architecture.complexity_level ?? selectedArchitecture?.complexity_level,
                            )}
                          </span>
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">Validation status</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {validationStatus === 'loading'
                            ? 'Building preview'
                            : validationStatus === 'valid'
                              ? 'Healthy'
                              : validationStatus === 'invalid'
                                ? 'Needs attention'
                                : validationStatus === 'error'
                                  ? 'Preview failed'
                                  : 'Empty'}
                        </p>
                        <p className="mt-2">
                          {validationStatus === 'empty'
                            ? 'Run preview to inspect warnings, recommendations and the normalized technology graph.'
                            : validationStatus === 'valid'
                              ? 'The backend returned a valid foundation blueprint.'
                              : validationStatus === 'loading'
                                ? 'The backend is resolving the blueprint now.'
                                : 'The backend returned explicit blueprint issues or failed to complete the preview.'}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)] md:col-span-2">
                        <p className="font-semibold text-[color:var(--text)]">Prompt Master status</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {promptMasterStatus === 'loading'
                            ? 'Building Prompt Master'
                            : promptMasterStatus === 'valid'
                              ? 'Ready'
                              : promptMasterStatus === 'invalid'
                                ? 'Needs attention'
                                : promptMasterStatus === 'error'
                                  ? 'Preview failed'
                                  : 'Empty'}
                        </p>
                        <p className="mt-2">
                          {promptMasterStatus === 'empty'
                            ? 'Build the blueprint first, then transform it into a structured Prompt Master document.'
                            : promptMasterStatus === 'loading'
                              ? 'The backend is turning the blueprint into a technical contract now.'
                              : promptMasterStatus === 'valid'
                                ? 'All mandatory Prompt Master sections are available.'
                                : promptMasterStatus === 'invalid'
                                  ? 'The Prompt Master preserved blueprint issues and explicit constraints.'
                                  : 'The Prompt Master preview request failed.'}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)] md:col-span-2">
                        <p className="font-semibold text-[color:var(--text)]">Gatekeeper status</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {gatekeeperStatus === 'loading'
                            ? 'Running Gatekeeper'
                            : gatekeeperStatus === 'valid'
                              ? 'Approved'
                              : gatekeeperStatus === 'warning'
                                ? 'Approved with warnings'
                                : gatekeeperStatus === 'invalid'
                                  ? 'Blocked'
                                  : gatekeeperStatus === 'error'
                                    ? 'Preview failed'
                                    : 'Empty'}
                        </p>
                        <p className="mt-2">
                          {gatekeeperStatus === 'empty'
                            ? 'Run Gatekeeper after the Prompt Master preview to get a governed decision before any future generation phase.'
                            : gatekeeperStatus === 'loading'
                              ? 'The backend is validating the blueprint and Prompt Master pair now.'
                              : gatekeeperStatus === 'valid'
                                ? 'All mandatory Gatekeeper checks passed.'
                                : gatekeeperStatus === 'warning'
                                  ? 'The Gatekeeper found warnings but did not block progression.'
                                  : gatekeeperStatus === 'invalid'
                                    ? 'The Gatekeeper found critical blockers.'
                                    : 'The Gatekeeper preview request failed.'}
                        </p>
                      </div>
                    </div>

                    <DependencyGraphPanel
                      snapshot={dependencyGraphSnapshot}
                      impact={dependencyImpact}
                      readiness={dependencyReadiness}
                      risks={dependencyRisks}
                      isLoading={dependencyGraphQuery.isLoading || impactAnalysisQuery.isLoading || readinessAnalysisQuery.isLoading || riskAnalysisQuery.isLoading}
                      errorMessage={
                        dependencyGraphQuery.isError || impactAnalysisQuery.isError || readinessAnalysisQuery.isError || riskAnalysisQuery.isError
                          ? 'Dependency graph services are offline, but the wizard keeps the current selection safe.'
                          : null
                      }
                    />

                    <ArchitecturalGraphCanvas
                      payload={architecturalGraphPayload}
                      title="Architecture Graph"
                      offlineMessage="Architectural graph services are offline, but the selected blueprint remains safe."
                    />

                    <VisualizationCockpit
                      payload={dependencyGraphPayload}
                      offlineMessage="System design visualization services are offline, but the selected architecture path remains safe."
                    />

                    <EngineeringReadinessPanel
                      readiness={engineeringReadiness}
                      team={teamProfileQuery.data ?? null}
                      delivery={deliveryEstimateQuery.data ?? null}
                      isLoading={engineeringReadinessQuery.isLoading || teamProfileQuery.isLoading || deliveryEstimateQuery.isLoading}
                      errorMessage={
                        engineeringReadinessQuery.isError || teamProfileQuery.isError || deliveryEstimateQuery.isError
                          ? 'Engineering readiness services are offline, but the wizard keeps the selected team profile safe.'
                          : null
                      }
                    />

                    {blueprintPreviewMutation.isError ? (
                      <PageError
                        title="Blueprint preview failed"
                        description={getApiErrorMessage(
                          blueprintPreviewMutation.error,
                          'Unable to build the current blueprint preview.',
                        )}
                        onRetry={previewCurrentBlueprint}
                        className="p-4"
                      />
                    ) : null}

                    {blueprintPreviewMutation.isPending ? (
                      <CardLoading className="p-0 shadow-none" />
                    ) : backendBlueprint ? (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <Badge>{backendBlueprint.validation.valid ? 'Valid blueprint' : 'Blueprint returned issues'}</Badge>
                          <Badge>{backendBlueprint.validation.errors.length} errors</Badge>
                          <Badge>{backendBlueprint.validation.warnings.length} warnings</Badge>
                          <Badge>{backendBlueprint.recommendations.length} recommendations</Badge>
                        </div>

                        {backendBlueprint.validation.errors.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Errors</p>
                            {backendBlueprint.validation.errors.map((item) => (
                              <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                            ))}
                          </div>
                        ) : null}

                        {backendBlueprint.validation.warnings.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Warnings</p>
                            {backendBlueprint.validation.warnings.map((item) => (
                              <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                            ))}
                          </div>
                        ) : null}

                        {backendBlueprint.validation.suggestions.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Suggestions</p>
                            {backendBlueprint.validation.suggestions.map((suggestion) => (
                              <p key={suggestion} className="text-sm text-[color:var(--muted)]">{suggestion}</p>
                            ))}
                          </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Technology graph snapshot</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">Normalized stack path returned by the backend preview engine.</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Architecture profile snapshot</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">Operational complexity, infrastructure expectations and recommended patterns.</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Complexity profile snapshot</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">Explicit foundation scoring before any future generation phase.</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">Infrastructure profile snapshot</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">Selected foundation components and recommendations stay visible in the blueprint preview.</p>
                          </div>
                        </div>

                        <ReviewDisclosure
                          title="Stack path preview"
                          description="Normalized stack path returned by the backend preview engine."
                          defaultOpen
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Language</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.language.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Runtime</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.runtime.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Framework</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.framework.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Architecture</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.architecture.name}</p>
                            </div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title="Architecture profile details"
                          description="Operational complexity, infrastructure expectations and recommended patterns."
                        >
                          <div className="space-y-3 text-sm text-[color:var(--muted)]">
                            <p>Scalability profile: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.scalability_profile}</span></p>
                            <p>Deployment complexity: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.deployment_complexity}</span></p>
                            <p>Required infrastructure: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.required_infrastructure.join(', ') || 'none'}</span></p>
                            <p>Recommended patterns: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.recommended_patterns.join(', ') || 'none'}</span></p>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title="Infrastructure profile details"
                          description="Foundation components selected in the wizard and the backend recommendations returned for this blueprint."
                        >
                          <div className="space-y-4 text-sm text-[color:var(--muted)]">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Selected foundation</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedInfrastructureComponents.length ? (
                                  selectedInfrastructureComponents.map((component) => (
                                    <Badge key={component.id} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                      {component.name}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-[color:var(--muted)]">No infrastructure foundation selected yet.</span>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Required</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.required_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.required_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>No required foundation items.</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Recommended</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.recommended_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.recommended_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>No recommended foundation items.</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Optional</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.optional_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.optional_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>No optional foundation items.</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {backendBlueprint.infrastructure_profile.warnings.length ? (
                              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">Warnings</p>
                                <div className="mt-2 space-y-1">
                                  {backendBlueprint.infrastructure_profile.warnings.map((warning) => (
                                    <p key={warning}>{warning}</p>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title="Complexity profile details"
                          description="Explicit foundation scoring before any future generation phase."
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Learning curve: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.learning_curve}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Implementation effort: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.implementation_effort}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Infrastructure cost: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.infrastructure_cost}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Maintenance cost: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.maintenance_cost}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Team recommendation: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.team_size_recommendation}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">Risk level: <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.risk_level}</span></div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title="Modules and endpoints"
                          description="Selected operational domains and route ownership returned by the backend."
                        >
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">Business modules</p>
                              {backendBlueprint.business_modules.map((module) => (
                                <div key={module.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">
                                  <span className="font-semibold text-[color:var(--text)]">{module.name}</span> {module.description}
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">Endpoints</p>
                              {backendBlueprint.endpoints.map((endpoint) => (
                                <div key={endpoint.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">
                                  <span className="font-semibold text-[color:var(--text)]">{endpoint.method} {endpoint.path}</span> {endpoint.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title="Recommendations"
                          description="Foundation recommendations returned by the backend engine."
                        >
                          {backendBlueprint.recommendations.length ? (
                            <div className="space-y-2">
                              {backendBlueprint.recommendations.map((recommendation) => (
                                <div key={`${recommendation.type}-${recommendation.message}`} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">
                                  <span className="font-semibold text-[color:var(--text)]">{recommendation.severity}</span> {recommendation.message}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-[color:var(--muted)]">No additional recommendations were generated for this preview.</p>
                          )}
                        </ReviewDisclosure>

                        {promptMasterPreviewMutation.isError ? (
                          <PageError
                            title="Prompt Master preview failed"
                            description={getApiErrorMessage(
                              promptMasterPreviewMutation.error,
                              'Unable to transform the current blueprint into a Prompt Master preview.',
                            )}
                            onRetry={previewPromptMaster}
                            className="p-4"
                          />
                        ) : null}

                        {promptMasterPreviewMutation.isPending ? (
                          <CardLoading className="p-0 shadow-none" />
                        ) : promptMasterDocument ? (
                          <SelectionGroup
                            title="Prompt Master preview"
                            description="A structured technical contract derived from the current Project Blueprint. This layer is preview-only and does not generate code."
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{promptMasterDocument.validation.valid ? 'Valid Prompt Master' : 'Prompt Master returned issues'}</Badge>
                              <Badge>{promptMasterDocument.sections.length} sections</Badge>
                              <Badge>{promptMasterDocument.validation.errors.length} errors</Badge>
                              <Badge>{promptMasterDocument.validation.warnings.length} warnings</Badge>
                            </div>

                            {promptMasterDocument.validation.errors.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">Prompt Master errors</p>
                                {promptMasterDocument.validation.errors.map((item) => (
                                  <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                                ))}
                              </div>
                            ) : null}

                            {promptMasterDocument.validation.warnings.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">Prompt Master warnings</p>
                                {promptMasterDocument.validation.warnings.map((item) => (
                                  <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                                ))}
                              </div>
                            ) : null}

                            {promptMasterDocument.validation.constraints.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">Constraints</p>
                                {promptMasterDocument.validation.constraints.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                              <p className="text-sm font-semibold text-[color:var(--text)]">Prompt Master sections</p>
                              <p className="mt-2 text-sm text-[color:var(--muted)]">All mandatory sections are compiled from the validated blueprint without changing the chosen stack.</p>
                            </div>

                            <ReviewDisclosure
                              title="Prompt Master sections details"
                              description="All mandatory sections are compiled from the validated blueprint without changing the chosen stack."
                              defaultOpen
                            >
                              <div className="space-y-3">
                                {promptMasterDocument.sections.map((section) => (
                                  <details
                                    key={section.id}
                                    className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4"
                                  >
                                    <summary className="focus-ring cursor-pointer list-none rounded-xl text-sm font-semibold text-[color:var(--text)]">
                                      {section.title}
                                    </summary>
                                    <p className="mt-3 text-sm text-[color:var(--muted)]">{section.summary}</p>
                                    <p className="mt-3 text-sm leading-6 text-[color:var(--muted)]">{section.content}</p>
                                    <div className="mt-3 space-y-2">
                                      {section.bullets.map((bullet) => (
                                        <p key={bullet} className="text-sm text-[color:var(--muted)]">- {bullet}</p>
                                      ))}
                                    </div>
                                  </details>
                                ))}
                              </div>
                            </ReviewDisclosure>

                            <ReviewDisclosure
                              title="Prompt Master trace"
                              description="Safe trace metadata keeps the Prompt Master auditable without carrying secrets."
                            >
                              <div className="space-y-3 text-sm text-[color:var(--muted)]">
                                <p>
                                  Blueprint id:{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.blueprint_id}
                                  </span>
                                </p>
                                <p>
                                  Included sections:{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.included_sections.join(', ')}
                                  </span>
                                </p>
                                <p>
                                  Redacted fields:{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.redacted_fields.join(', ')}
                                  </span>
                                </p>
                                <p>
                                  Contains secrets:{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.contains_secrets ? 'yes' : 'no'}
                                  </span>
                                </p>
                              </div>
                            </ReviewDisclosure>

                            <ReviewDisclosure
                              title="Compiled Prompt Master"
                              description="Plain-text technical contract for later human-approved phases. Copy is enabled, generation is not."
                            >
                              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-xl)] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-[color:var(--muted)]">
                                {promptMasterDocument.compiled_prompt}
                              </pre>
                            </ReviewDisclosure>
                          </SelectionGroup>
                        ) : (
                          <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                            The Prompt Master preview will appear here once you transform a real blueprint preview.
                          </div>
                        )}

                        {gatekeeperPreviewMutation.isError ? (
                          <PageError
                            title="Gatekeeper preview failed"
                            description={getApiErrorMessage(
                              gatekeeperPreviewMutation.error,
                              'Unable to validate the current blueprint and Prompt Master pair.',
                            )}
                            onRetry={runGatekeeper}
                            className="p-4"
                          />
                        ) : null}

                        {gatekeeperPreviewMutation.isPending ? (
                          <CardLoading className="p-0 shadow-none" />
                        ) : gatekeeperReport ? (
                          <SelectionGroup
                            title="Gatekeeper report"
                            description="Governed validation over the Project Blueprint and Prompt Master before any future generation phase."
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{gatekeeperReport.decision}</Badge>
                              <Badge>{gatekeeperReport.checks.length} checks</Badge>
                              <Badge>{gatekeeperReport.blockers.length} blockers</Badge>
                              <Badge>{gatekeeperReport.warnings.length} warnings</Badge>
                            </div>

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4 text-sm text-[color:var(--muted)]">
                              <p className="font-semibold text-[color:var(--text)]">Decision summary</p>
                              <p className="mt-2">{gatekeeperReport.summary}</p>
                            </div>

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                              <p className="text-sm font-semibold text-[color:var(--text)]">Gatekeeper checks</p>
                              <p className="mt-2 text-sm text-[color:var(--muted)]">Each mandatory validation check is evaluated independently and surfaced with blockers or warnings.</p>
                            </div>

                            {gatekeeperReport.blockers.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">Blockers</p>
                                {gatekeeperReport.blockers.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            {gatekeeperReport.warnings.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">Warnings</p>
                                {gatekeeperReport.warnings.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            <ReviewDisclosure
                              title="Gatekeeper checks details"
                              description="Each mandatory validation check is evaluated independently and surfaced with blockers or warnings."
                              defaultOpen
                            >
                              <div className="space-y-3">
                                {gatekeeperReport.checks.map((check) => (
                                  <div key={check.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <p className="text-sm font-semibold text-[color:var(--text)]">{check.title}</p>
                                      <div className="flex flex-wrap gap-2">
                                        <Badge>{check.status}</Badge>
                                        <Badge>{check.severity}</Badge>
                                      </div>
                                    </div>
                                    <p className="mt-3 text-sm text-[color:var(--muted)]">{check.summary}</p>
                                    {check.blockers.length ? (
                                      <div className="mt-3 space-y-2">
                                        {check.blockers.map((item) => (
                                          <p key={item} className="text-sm text-[color:var(--muted)]">Blocker: {item}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                    {check.warnings.length ? (
                                      <div className="mt-3 space-y-2">
                                        {check.warnings.map((item) => (
                                          <p key={item} className="text-sm text-[color:var(--muted)]">Warning: {item}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </ReviewDisclosure>

                            <ReviewDisclosure
                              title="Gatekeeper trace"
                              description="Safe trace metadata for the Gatekeeper execution without any secret exposure."
                            >
                              <div className="space-y-3 text-sm text-[color:var(--muted)]">
                                <p>
                                  Blueprint id: <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.blueprint_id}</span>
                                </p>
                                <p>
                                  Prompt Master id: <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.prompt_master_id}</span>
                                </p>
                                <p>
                                  Checks: <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.check_ids.join(', ')}</span>
                                </p>
                                <p>
                                  Redacted fields: <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.redacted_fields.join(', ')}</span>
                                </p>
                                <p>
                                  Contains secrets: <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.contains_secrets ? 'yes' : 'no'}</span>
                                </p>
                              </div>
                            </ReviewDisclosure>
                          </SelectionGroup>
                        ) : (
                          <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                            The Gatekeeper report will appear here once you validate the current blueprint and Prompt Master pair.
                          </div>
                        )}

                        {saveProjectMutation.isError ? (
                          <PageError
                            title="Project save failed"
                            description={getApiErrorMessage(
                              saveProjectMutation.error,
                              'Unable to persist the current wizard selection as a project record.',
                            )}
                            onRetry={saveProject}
                            className="p-4"
                          />
                        ) : null}

                        {savedProject ? (
                          <SelectionGroup
                            title="Project saved"
                            description="The validated wizard selection is now persisted as a Project Record in the backend registry."
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{savedProject.status}</Badge>
                              <Badge>{savedProject.readiness_status}</Badge>
                            </div>
                            <p className="text-sm text-[color:var(--muted)]">
                              Project id: <span className="font-semibold text-[color:var(--text)]">{savedProject.project_id}</span>
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <ActionLink href={`/projects/${savedProject.project_id}`} variant="primary">
                                Open project details
                              </ActionLink>
                              <ActionLink href="/projects" variant="secondary">
                                Open project registry
                              </ActionLink>
                            </div>
                          </SelectionGroup>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        The backend blueprint preview will appear here once you run the preview action.
                      </div>
                    )}
                  </SelectionGroup>
                </StepShell>
              ) : null}
            </>
          )}
        </div>

        <Card className="h-fit space-y-5 p-5 2xl:sticky 2xl:top-24">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
              Blueprint Preview
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              A sticky summary stays visible while the center panel reveals only the current step.
            </p>
          </div>

          {languageId ? (
            <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">
                  {selectedLanguageProfile ? `${selectedLanguageProfile.name} recommendations` : 'Language recommendations'}
                </p>
                <Badge>{languageRecommendationsQuery.data?.length ?? 0}</Badge>
              </div>
              {languageRecommendationsQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">Loading language recommendations...</p>
              ) : languageRecommendationsQuery.isError ? (
                <p className="text-sm text-[color:var(--muted)]">
                  The language recommendation feed is unavailable, but the wizard remains safe to use offline.
                </p>
              ) : languageRecommendationsQuery.isEmpty ? (
                <p className="text-sm text-[color:var(--muted)]">No recommendations were returned for this language.</p>
              ) : (
                <div className="grid gap-2">
                  {(languageRecommendationsQuery.data ?? []).slice(0, 3).map((recommendation) => (
                    <div key={recommendation.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{recommendation.title}</p>
                        <Badge>{recommendation.priority}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{recommendation.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {templateSelectionPayload ? (
            <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4" data-testid="template-recommendations-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">Compatible templates</p>
                <Badge>{compatibleTemplateRecommendations.length}</Badge>
              </div>
              {recommendedTemplatesQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">Validating template compatibility...</p>
              ) : recommendedTemplatesQuery.isError ? (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  Template recommendations are offline. The wizard remains usable without external marketplace access.
                </p>
              ) : compatibleTemplateRecommendations.length ? (
                <div className="grid gap-2">
                  {compatibleTemplateRecommendations.slice(0, 3).map((recommendation) => (
                    <div key={recommendation.template.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{recommendation.template.name}</p>
                        <Badge>{recommendation.compatibility?.score ?? 0}% match</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                        Matched {recommendation.compatibility?.matched.join(', ') || 'template metadata'} from the local registry.
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge>{recommendation.template.category}</Badge>
                        <Badge>{recommendation.template.complexity}</Badge>
                        <Badge>{recommendation.template.maturity}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  No compatible local templates for the current selection. Incompatible templates are hidden.
                </p>
              )}
              <div className="grid gap-2 text-xs text-[color:var(--muted)]">
                <span>Template compatibility validated</span>
                <span>{compatibleTemplateRecommendations.length ? 'Recommended template detected' : 'Recommended template pending'}</span>
                <span>Template maturity verified</span>
              </div>
            </div>
          ) : null}

          {templateSelectionPayload ? (
            <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4" data-testid="wizard-skills-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">Skills unlocked by this project</p>
                <Badge>{recommendedSkillsQuery.data?.filter((skill) => skill.unlocked).length ?? 0}</Badge>
              </div>
              {recommendedSkillsQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">Syncing skill registry...</p>
              ) : recommendedSkillsQuery.isError ? (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  Skill registry is offline. The wizard remains usable without skill execution.
                </p>
              ) : (
                <div className="grid gap-2">
                  {(recommendedSkillsQuery.data ?? []).filter((skill) => skill.unlocked).slice(0, 4).map((skill) => (
                    <div key={skill.skill_id} className="rounded-lg border border-white/10 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{skill.skill_id.replaceAll('_', ' ')}</p>
                        <Badge>{skill.score}%</Badge>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-[color:var(--muted)]">{skill.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          <LDCNPresenceRail
            context={ldcnContext}
            stepLabel={`Current step: ${currentStep.title}`}
            actions={['explain_current_page', 'review_blueprint', 'inspect_gatekeeper']}
          />

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
            <PreviewRow label="Language" value={previewSummary.language} />
            <PreviewRow label="Runtime" value={previewSummary.runtime} />
            <PreviewRow label="Framework" value={previewSummary.framework} />
            <PreviewRow label="Architecture" value={previewSummary.architecture} />
            <PreviewRow label="Archetype" value={previewSummary.archetype} />
            <PreviewRow label="Capabilities" value={previewSummary.capabilities} />
            <PreviewRow label="Modules" value={previewSummary.modules} />
            <PreviewRow label="Endpoints" value={previewSummary.endpoints} />
          </div>

          <ComplexityRadar
            title="Complexity radar"
            score={backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}
            axes={[
              {
                label: 'Learning curve',
                value:
                  backendBlueprint?.complexity_profile.learning_curve === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.learning_curve === 'medium'
                      ? 52
                      : 80,
              },
              {
                label: 'Implementation',
                value:
                  backendBlueprint?.complexity_profile.implementation_effort === 'low'
                    ? 26
                    : backendBlueprint?.complexity_profile.implementation_effort === 'medium'
                      ? 55
                      : 84,
              },
              {
                label: 'Infrastructure',
                value:
                  backendBlueprint?.complexity_profile.infrastructure_cost === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.infrastructure_cost === 'medium'
                      ? 58
                      : 86,
              },
              {
                label: 'Maintenance',
                value:
                  backendBlueprint?.complexity_profile.maintenance_cost === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.maintenance_cost === 'medium'
                      ? 56
                      : 82,
              },
              {
                label: 'Risk',
                value:
                  backendBlueprint?.complexity_profile.risk_level === 'low'
                    ? 22
                    : backendBlueprint?.complexity_profile.risk_level === 'medium'
                      ? 50
                      : 80,
              },
            ]}
          />

          <SurfaceDivider />

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Complexity estimate</p>
              <Badge>{backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}</Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {backendBlueprint?.complexity_profile.risk_level ?? complexityEstimate.label}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Validation</p>
              <Badge
                className={
                  validationStatus === 'valid'
                    ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)]'
                    : validationStatus === 'invalid'
                      ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] text-[color:var(--warning)]'
                    : validationStatus === 'error'
                        ? 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[color:var(--danger)]'
                        : ''
                }
              >
                {validationStatus}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {validationStatus === 'empty'
                ? 'Pending until blueprint review requests a real backend preview.'
                : validationStatus === 'loading'
                  ? 'Building the normalized blueprint now.'
                  : validationStatus === 'valid'
                    ? 'The current blueprint preview is valid.'
                    : validationStatus === 'invalid'
                      ? 'Warnings or incompatibilities were found.'
                      : 'Validation request failed.'}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Prompt Master</p>
              <Badge
                className={
                  promptMasterStatus === 'valid'
                    ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)]'
                    : promptMasterStatus === 'invalid'
                      ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] text-[color:var(--warning)]'
                    : promptMasterStatus === 'error'
                        ? 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[color:var(--danger)]'
                        : ''
                }
              >
                {promptMasterStatus}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {promptMasterStatus === 'empty'
                ? 'Pending until a real blueprint preview is transformed into a Prompt Master.'
                : promptMasterStatus === 'loading'
                  ? 'Building the technical contract now.'
                  : promptMasterStatus === 'valid'
                    ? 'The Prompt Master preview is ready to inspect and copy.'
                    : promptMasterStatus === 'invalid'
                      ? 'The Prompt Master captured unresolved blueprint issues.'
                      : 'Prompt Master request failed.'}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">Gatekeeper</p>
              <Badge
                className={
                  gatekeeperStatus === 'valid'
                    ? 'border-[color-mix(in_srgb,var(--accent)_34%,transparent)]'
                    : gatekeeperStatus === 'warning'
                      ? 'border-[color-mix(in_srgb,var(--warning)_34%,transparent)] text-[color:var(--warning)]'
                      : gatekeeperStatus === 'invalid' || gatekeeperStatus === 'error'
                        ? 'border-[color-mix(in_srgb,var(--danger)_34%,transparent)] text-[color:var(--danger)]'
                        : ''
                }
              >
                {gatekeeperStatus}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {gatekeeperStatus === 'empty'
                ? 'Pending until Gatekeeper validates the blueprint and Prompt Master pair.'
                : gatekeeperStatus === 'loading'
                  ? 'Running governed validation now.'
                  : gatekeeperStatus === 'valid'
                    ? 'The Gatekeeper approved the current pair.'
                    : gatekeeperStatus === 'warning'
                      ? 'The Gatekeeper approved with warnings.'
                      : gatekeeperStatus === 'invalid'
                        ? 'The Gatekeeper blocked progression.'
                        : 'Gatekeeper request failed.'}
            </p>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4 text-xs leading-6 text-[color:var(--muted)]">
            Next step: <span className="font-semibold text-[color:var(--text)]">{currentStep.title}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
