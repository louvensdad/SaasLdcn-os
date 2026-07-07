'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, Database, Gauge, GitBranch, Layers3, ShieldCheck, Sparkles } from 'lucide-react';

import { LDCNPresenceRail } from '@/components/ldcn/ldcn-presence-rail';
import { ActionLink } from '@/components/ui/action-link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Disclosure } from '@/components/ui/disclosure';
import { EmptyState } from '@/components/empty-states/empty-state';
import { PageError } from '@/components/feedback/error-system';
import { ButtonLoading, CardLoading } from '@/components/feedback/loading-system';
import { CheckboxField, SelectField, TextareaField, TextField } from '@/components/forms/form-field';
import { SectionHeader } from '@/components/shell/section-header';
import { Tabs } from '@/components/ui/tabs';
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
import { useLocale } from '@/hooks/use-locale';
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
import { useLocaleStore } from '@/stores/use-locale-store';
import { FrameworkSpecialistPanel } from '@/components/wizard/framework-specialist-panel';
import { DependencyGraphPanel } from '@/components/wizard/dependency-graph-panel';
import { InfrastructureRecommendationsPanel } from '@/components/wizard/infrastructure-recommendations-panel';
import { EngineeringReadinessPanel } from '@/components/wizard/engineering-readiness-panel';
import { VisualizationCockpit } from '@/components/system-design/visualization-cockpit';
import { ArchitecturalGraphCanvas } from '@/components/architectural-graph/architectural-graph-canvas';
import { AiIntakePanel } from '@/components/wizard/ai-intake-panel';
import { LlmToolCard, type LlmToolState } from '@/components/wizard/llm-tool-card';
import { matchSuggestedStack, specToRequirementFields } from '@/components/wizard/spec-to-wizard';
import type { ProjectSpec } from '@/lib/api/meta-factory';

type WizardStepId =
  | 'project_requirements'
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
    id: 'project_requirements',
    title: 'Project Requirements',
    eyebrow: 'Step 1',
    description: 'Define intent, business rules, data model, and delivery target.',
  },
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

const CAPABILITY_CATEGORY_KEYS: Record<string, string> = {
  security: 'wizard.category.capability.security',
  platform: 'wizard.category.capability.platform',
  commerce: 'wizard.category.capability.commerce',
  communication: 'wizard.category.capability.communication',
  ai: 'wizard.category.capability.ai',
  data: 'wizard.category.capability.data',
  quality: 'wizard.category.capability.quality',
  experience: 'wizard.category.capability.experience',
};

const MODULE_CATEGORY_KEYS: Record<string, string> = {
  core: 'wizard.category.module.core',
  commerce: 'wizard.category.module.commerce',
  operations: 'wizard.category.module.operations',
  finance: 'wizard.category.module.finance',
  communication: 'wizard.category.module.communication',
  governance: 'wizard.category.module.governance',
  education: 'wizard.category.module.education',
};

const LOCALE_OPTIONS = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'] as const;
const GENERATION_MODE_OPTIONS = [
  { value: 'local_build_90' },
  { value: 'foundation_only' },
  { value: 'template_assisted' },
  { value: 'guided' },
] as const;
const PRODUCT_GOAL_OPTIONS = ['erp', 'crm', 'marketplace', 'saas', 'internal', 'education', 'finance', 'healthcare', 'other'] as const;
const TARGET_USER_OPTIONS = ['administrator', 'customer', 'operator', 'partner', 'manager'] as const;

function toggleSelection(current: readonly string[], value: string) {
  return current.includes(value)
    ? current.filter((item) => item !== value)
    : [...current, value];
}

function splitRequirements(value: string) {
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
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

function projectNameFromSpec(spec: ProjectSpec) {
  const source = spec.product_summary || spec.raw_intent || 'ldcn-project';
  const normalized = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || 'ldcn-project';
}

function suggestedStackLabel(spec: ProjectSpec) {
  return [
    spec.suggested_stack?.language,
    spec.suggested_stack?.runtime,
    spec.suggested_stack?.framework,
    spec.suggested_stack?.architecture,
  ]
    .filter(Boolean)
    .join(' / ');
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
    return { score, key: 'wizard.complexity.enterpriseHeavy' };
  }
  if (score >= 60) {
    return { score, key: 'wizard.complexity.strategicBuild' };
  }
  if (score >= 35) {
    return { score, key: 'wizard.complexity.balancedFoundation' };
  }
  return { score, key: 'wizard.complexity.leanBlueprint' };
}

function StepStatusBadge({ state }: { readonly state: StepVisualState }) {
  const { t } = useLocale();
  const styles: Record<StepVisualState, string> = {
    locked: 'border-white/10 text-[color:var(--muted)]',
    active: 'border-[color-mix(in_srgb,var(--accent)_45%,transparent)] text-[color:var(--text)]',
    completed: 'border-[color-mix(in_srgb,var(--accent)_38%,transparent)] text-[color:var(--text)]',
    warning: 'border-[color-mix(in_srgb,var(--warning)_40%,transparent)] text-[color:var(--warning)]',
    error: 'border-[color-mix(in_srgb,var(--danger)_40%,transparent)] text-[color:var(--danger)]',
  };

  const labels: Record<StepVisualState, string> = {
    locked: t('wizard.status.locked'),
    active: t('wizard.status.active'),
    completed: t('wizard.status.done'),
    warning: t('wizard.status.warning'),
    error: t('wizard.status.error'),
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
    <Card surface="primary" className="relative min-h-[32rem] p-0" data-visibility-audit="wizard-step-card">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_30%)]" />
      <div className="relative space-y-8 p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <p className="ds-caption text-[color:var(--muted)]">
              {step.eyebrow}
            </p>
            <h2 className="ds-page-title mt-3 text-[color:var(--text)]">{step.title}</h2>
            <p className="ds-body mt-3 max-w-xl text-[color:var(--muted)]">{step.description}</p>
          </div>
          <StepStatusBadge state={stepState} />
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
  const { t } = useLocale();
  const pending = value === 'pending';
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-[color:var(--muted)]">{label}</span>
      <span className={pending ? 'text-[color:var(--muted)]' : 'font-semibold text-[color:var(--text)]'}>{pending ? t('wizard.pending') : value}</span>
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

/**
 * Single-select chip grid, styled like FieldShell (label + description above
 * the control). Used for every stack decision (language, runtime, framework,
 * architecture, archetype) so the whole wizard picks one way to choose
 * between options, instead of mixing native <select> dropdowns with button
 * chips depending on the step.
 */
function ChoiceField({
  label,
  description,
  value,
  onChange,
  options,
  emptyMessage,
}: {
  readonly label: string;
  readonly description?: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly { id: string; name: string }[];
  readonly emptyMessage?: string;
}) {
  // A <label> can only wrap ONE form control -- wrapping a whole button group
  // in one makes every button's accessible name absorb the label PLUS every
  // sibling button's text (confirmed live: a "Node.js" chip's accessible name
  // came back as "2. Runtime Ambiente de execução. Bun Deno"). role="group" +
  // aria-labelledby is the correct pattern for a labelled set of buttons.
  const labelId = useId();
  return (
    <div className="block">
      <span id={labelId} className="text-sm font-semibold text-[color:var(--text)]">{label}</span>
      {description ? <span className="mt-1 block text-xs leading-5 text-[color:var(--muted)]">{description}</span> : null}
      <div role="group" aria-labelledby={labelId} className="mt-2 flex flex-wrap gap-2">
        {options.length === 0 && emptyMessage ? (
          <p className="text-sm text-[color:var(--muted)]">{emptyMessage}</p>
        ) : null}
        {options.map((option) => (
          <Button
            key={option.id}
            type="button"
            data-option-id={option.id}
            variant={value === option.id ? 'primary' : 'secondary'}
            onClick={() => onChange(option.id)}
          >
            {option.name}
          </Button>
        ))}
      </div>
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
          {title}
        </summary>
        <div className="mt-4">{children}</div>
      </details>
    </div>
  );
}

export default function WizardPage() {
  const { t } = useLocale();
  const statusLabel = (status: string) => t(`wizard.status.${status}`);
  const interfaceLocale = useLocaleStore((state) => state.interfaceLocale);
  const localizedWizardSteps = WIZARD_STEPS.map((step, index) => ({
    ...step,
    title: t(`wizard.steps.${step.id}.title`),
    eyebrow: t('wizard.step', { number: index + 1 }),
    description: t(`wizard.steps.${step.id}.description`),
  }));
  const router = useRouter();
  const languagesQuery = useLanguages();
  const runtimesQuery = useRuntimes();
  const modulesQuery = useBusinessModules();
  const endpointsQuery = useEndpoints();
  const addToast = useUiStore((state) => state.addToast);

  const [currentStepId, setCurrentStepId] = useState<WizardStepId>('project_requirements');
  const [languageId, setLanguageId] = useState('');
  const [runtimeId, setRuntimeId] = useState('');
  const [frameworkId, setFrameworkId] = useState('');
  const [architectureId, setArchitectureId] = useState('');
  const [archetypeId, setArchetypeId] = useState('');
  const [capabilityIds, setCapabilityIds] = useState<string[]>([]);
  const [businessModuleIds, setBusinessModuleIds] = useState<string[]>([]);
  const [endpointIds, setEndpointIds] = useState<string[]>([]);
  const [infrastructureComponentIds, setInfrastructureComponentIds] = useState<string[]>([]);
  const [projectName, setProjectName] = useState('');
  const [projectGoal, setProjectGoal] = useState('');
  const [businessContext, setBusinessContext] = useState('');
  const [targetUsers, setTargetUsers] = useState('');
  const [businessRules, setBusinessRules] = useState('');
  const [entities, setEntities] = useState('');
  const [workflows, setWorkflows] = useState('');
  const [constraints, setConstraints] = useState('');
  const [deliveryTarget, setDeliveryTarget] = useState<'zip' | 'github' | 'gitlab' | 'both' | ''>('');
  const [locale, setLocale] = useState<(typeof LOCALE_OPTIONS)[number]>(interfaceLocale);
  const [generationMode, setGenerationMode] = useState<(typeof GENERATION_MODE_OPTIONS)[number]['value']>('local_build_90');
  const [showAdvancedCapabilities, setShowAdvancedCapabilities] = useState(false);
  const [openEndpointModules, setOpenEndpointModules] = useState<string[]>([]);
  const [pendingAiStackSpec, setPendingAiStackSpec] = useState<ProjectSpec | null>(null);
  const [aiSuggestedStack, setAiSuggestedStack] = useState('');
  const lastInfrastructureSelectionKey = useRef<string | null>(null);

  useEffect(() => {
    setLocale(interfaceLocale);
  }, [interfaceLocale]);

  const toggleTargetUser = (value: string) => {
    const current = splitRequirements(targetUsers);
    setTargetUsers(toggleSelection(current, value).join('\n'));
  };

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
    for (const businessModule of sortedModules) {
      const currentGroup = groups.get(businessModule.category) ?? [];
      currentGroup.push(businessModule);
      groups.set(businessModule.category, currentGroup);
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
  const selectableEndpointCount = useMemo(
    () =>
      businessModuleIds.reduce(
        (count, moduleId) => count + (endpointsBySelectedModule.get(moduleId)?.length ?? 0),
        0,
      ),
    [businessModuleIds, endpointsBySelectedModule],
  );

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

  const blueprintToolState: LlmToolState = blueprintPreviewMutation.isPending
    ? 'loading'
    : blueprintPreviewMutation.isError
      ? 'error'
      : backendBlueprint
        ? backendBlueprint.validation.valid
          ? 'success'
          : 'warning'
        : 'empty';
  const promptMasterToolState: LlmToolState = promptMasterPreviewMutation.isPending
    ? 'loading'
    : promptMasterPreviewMutation.isError
      ? 'error'
      : promptMasterDocument
        ? promptMasterDocument.validation.valid
          ? 'success'
          : 'warning'
        : 'empty';
  const gatekeeperToolState: LlmToolState = gatekeeperPreviewMutation.isPending
    ? 'loading'
    : gatekeeperPreviewMutation.isError
      ? 'error'
      : gatekeeperReport
        ? gatekeeperReport.decision === 'blocked'
          ? 'error'
          : gatekeeperReport.decision === 'approved_with_warnings'
            ? 'warning'
            : 'success'
        : 'empty';
  const saveToolState: LlmToolState = saveProjectMutation.isPending
    ? 'loading'
    : saveProjectMutation.isError
      ? 'error'
      : savedProject
        ? 'success'
        : 'idle';

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

  const requirementsComplete = Boolean(
    projectName.trim() &&
      projectGoal.trim() &&
      businessContext.trim() &&
      splitRequirements(targetUsers).length &&
      splitRequirements(businessRules).length &&
      splitRequirements(entities).length &&
      splitRequirements(workflows).length &&
      splitRequirements(constraints).length &&
      deliveryTarget,
  );
  const technologyPathComplete = Boolean(requirementsComplete && languageId && runtimeId && frameworkId);
  const architectureComplete = Boolean(technologyPathComplete && architectureId);
  const projectTypeComplete = Boolean(architectureComplete && archetypeId);
  const capabilitiesComplete = Boolean(projectTypeComplete && (capabilityIds.length > 0 || availableCapabilities.length === 0));
  const modulesComplete = Boolean(capabilitiesComplete && businessModuleIds.length > 0);
  const endpointsComplete = Boolean(
    modulesComplete && (endpointIds.length > 0 || selectableEndpointCount === 0),
  );

  const stepAvailability = useMemo<Record<WizardStepId, boolean>>(
    () => ({
      project_requirements: true,
      technology_path: requirementsComplete,
      architecture: technologyPathComplete,
      project_type: architectureComplete,
      capabilities: projectTypeComplete,
      business_modules: capabilitiesComplete,
      endpoints: modulesComplete,
      blueprint_review: endpointsComplete,
    }),
    [
      architectureComplete,
      capabilitiesComplete,
      endpointsComplete,
      modulesComplete,
      projectTypeComplete,
      requirementsComplete,
      technologyPathComplete,
    ],
  );

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
    if (!pendingAiStackSpec) {
      return;
    }

    const matched = matchSuggestedStack(pendingAiStackSpec, {
      languages: languagesQuery.data ?? [],
      runtimes: runtimesQuery.data ?? [],
      frameworks: languageFrameworksQuery.data ?? [],
      architectures: languageArchitecturesQuery.data ?? [],
    });

    if (matched.languageId && matched.languageId !== languageId) {
      handleLanguageChange(matched.languageId);
      return;
    }

    if (
      matched.runtimeId &&
      matched.runtimeId !== runtimeId &&
      availableRuntimes.some((runtime) => runtime.id === matched.runtimeId)
    ) {
      handleRuntimeChange(matched.runtimeId);
      return;
    }

    if (
      matched.frameworkId &&
      matched.frameworkId !== frameworkId &&
      availableFrameworks.some((framework) => framework.id === matched.frameworkId)
    ) {
      handleFrameworkChange(matched.frameworkId);
      return;
    }

    if (
      matched.architectureId &&
      matched.architectureId !== architectureId &&
      availableArchitectures.some((architecture) => architecture.id === matched.architectureId)
    ) {
      handleArchitectureChange(matched.architectureId);
      setPendingAiStackSpec(null);
      return;
    }

    const waitingForDependentRegistries =
      (Boolean(matched.languageId) && languageFrameworksQuery.isLoading) ||
      (Boolean(matched.languageId) && languageArchitecturesQuery.isLoading);
    const appliedAvailableMatches =
      (!matched.languageId || matched.languageId === languageId) &&
      (!matched.runtimeId || matched.runtimeId === runtimeId) &&
      (!matched.frameworkId || matched.frameworkId === frameworkId) &&
      (!matched.architectureId || matched.architectureId === architectureId);

    if (!waitingForDependentRegistries && appliedAvailableMatches) {
      setPendingAiStackSpec(null);
    }
  }, [
    architectureId,
    availableArchitectures,
    availableFrameworks,
    availableRuntimes,
    frameworkId,
    languageArchitecturesQuery.data,
    languageArchitecturesQuery.isLoading,
    languageFrameworksQuery.data,
    languageFrameworksQuery.isLoading,
    languageId,
    languagesQuery.data,
    pendingAiStackSpec,
    runtimeId,
    runtimesQuery.data,
  ]);

  useEffect(() => {
    const allowedCapabilityIds = new Set(availableCapabilities.map((item) => item.id));
    setCapabilityIds((current) => current.filter((item) => allowedCapabilityIds.has(item)));
  }, [availableCapabilities]);

  useEffect(() => {
    const allowedModuleIds = new Set(availableModules.map((item) => item.id));
    setBusinessModuleIds((current) => current.filter((item) => allowedModuleIds.has(item)));
  }, [availableModules]);

  useEffect(() => {
    const selectedModuleIds = new Set(businessModuleIds);
    const allowedEndpointIds = new Set(
      availableEndpoints
        .filter(
          (endpoint) =>
            endpoint.business_module_id != null &&
            selectedModuleIds.has(endpoint.business_module_id),
        )
        .map((endpoint) => endpoint.id),
    );
    setEndpointIds((current) => current.filter((item) => allowedEndpointIds.has(item)));
  }, [availableEndpoints, businessModuleIds]);

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
    projectGoal,
    businessContext,
    targetUsers,
    businessRules,
    entities,
    workflows,
    constraints,
    deliveryTarget,
    runtimeId,
  ]);

  useEffect(() => {
    if (stepAvailability[currentStepId]) {
      return;
    }

    if (!requirementsComplete) {
      setCurrentStepId('project_requirements');
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
    requirementsComplete,
    stepAvailability,
    technologyPathComplete,
  ]);

  useEffect(() => {
    if (!blueprintPreviewMutation.isSuccess || !backendBlueprint) return;

    addToast({
      tone: backendBlueprint.validation.valid ? 'success' : 'warning',
      title: backendBlueprint.validation.valid ? t('wizard.toast.blueprintReady.title') : t('wizard.toast.blueprintIssues.title'),
      description: backendBlueprint.validation.valid
        ? t('wizard.toast.blueprintReady.description')
        : t('wizard.toast.blueprintIssues.description'),
    });
  }, [addToast, backendBlueprint, blueprintPreviewMutation.isSuccess, t]);

  useEffect(() => {
    if (!promptMasterPreviewMutation.isSuccess || !promptMasterDocument) return;

    addToast({
      tone: promptMasterDocument.validation.valid ? 'success' : 'warning',
      title: promptMasterDocument.validation.valid
        ? t('wizard.toast.promptMasterReady.title')
        : t('wizard.toast.promptMasterIssues.title'),
      description: promptMasterDocument.validation.valid
        ? t('wizard.toast.promptMasterReady.description')
        : t('wizard.toast.promptMasterIssues.description'),
    });
  }, [addToast, promptMasterDocument, promptMasterPreviewMutation.isSuccess, t]);

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
          ? t('wizard.toast.gatekeeperApproved.title')
          : gatekeeperReport.decision === 'approved_with_warnings'
            ? t('wizard.toast.gatekeeperApprovedWithWarnings.title')
            : t('wizard.toast.gatekeeperBlocked.title'),
      description: gatekeeperReport.summary,
    });
  }, [addToast, gatekeeperPreviewMutation.isSuccess, gatekeeperReport, t]);

  function goToNextStep(stepId: WizardStepId) {
    const currentIndex = STEP_INDEX_BY_ID[stepId];
    const nextStep = WIZARD_STEPS[currentIndex + 1];
    if (!nextStep || !stepAvailability[nextStep.id]) return;
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

  function handleApplyProjectSpec(spec: ProjectSpec) {
    const fields = specToRequirementFields(spec);
    const stackLabel = suggestedStackLabel(spec);

    setProjectName((current) => current.trim() || projectNameFromSpec(spec));
    setProjectGoal(fields.projectGoal);
    setBusinessContext(fields.businessContext);
    setTargetUsers(fields.targetUsers);
    setBusinessRules(fields.businessRules);
    setEntities(fields.entities);
    setWorkflows(fields.workflows);
    setConstraints(fields.constraints);
    setDeliveryTarget((current) => current || 'zip');
    if (LOCALE_OPTIONS.includes(spec.locale as (typeof LOCALE_OPTIONS)[number])) {
      setLocale(spec.locale as (typeof LOCALE_OPTIONS)[number]);
    }

    setAiSuggestedStack(stackLabel);
    setPendingAiStackSpec(spec);

    addToast({
      tone: 'success',
      title: t('wizard.toast.intakeApplied.title'),
      description: stackLabel
        ? t('wizard.toast.intakeApplied.descriptionWithStack', { stack: stackLabel })
        : t('wizard.toast.intakeApplied.description'),
    });
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
    if (!requirementsComplete) {
      addToast({
        tone: 'error',
        title: t('wizard.toast.requirementsIncomplete.title'),
        description: t('wizard.toast.requirementsIncomplete.description'),
      });
      return;
    }
    if (!languageId || !runtimeId || !frameworkId || !architectureId || !archetypeId) {
      addToast({
        tone: 'error',
        title: t('wizard.toast.selectionIncomplete.title'),
        description: t('wizard.toast.selectionIncomplete.description'),
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
      project_requirements: {
        project_goal: projectGoal.trim(),
        business_context: businessContext.trim(),
        target_users: splitRequirements(targetUsers),
        business_rules: splitRequirements(businessRules),
        entities: splitRequirements(entities),
        workflows: splitRequirements(workflows),
        constraints: splitRequirements(constraints),
        delivery_target: deliveryTarget || null,
      },
    });
  }

  function previewPromptMaster() {
    if (!backendBlueprint) {
      addToast({
        tone: 'error',
        title: t('wizard.toast.blueprintPreviewRequired.title'),
        description: t('wizard.toast.blueprintPreviewRequired.description'),
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
        title: t('wizard.toast.previewChainIncomplete.title'),
        description: t('wizard.toast.previewChainIncomplete.description'),
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
        title: t('wizard.toast.validationChainIncomplete.title'),
        description: t('wizard.toast.validationChainIncomplete.description'),
      });
      return;
    }
    if (gatekeeperReport.decision === 'blocked') {
      addToast({
        tone: 'error',
        title: t('wizard.toast.gatekeeperBlocked.title'),
        description: gatekeeperReport.summary,
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
        title: t('wizard.toast.projectSaved.title'),
        description: t('wizard.toast.projectSaved.description', { projectName: saved.project_name }),
      });
      router.push(`/projects/${saved.project_id}`);
    } catch (error) {
      addToast({
        tone: 'error',
        title: t('wizard.toast.projectSaveFailed.title'),
        description: getApiErrorMessage(error, t('wizard.toast.projectSaveFailedFallback')),
      });
    }
  }

  async function copyPromptMaster() {
    if (!promptMasterDocument) {
      addToast({
        tone: 'error',
        title: t('wizard.toast.promptMasterUnavailable.title'),
        description: t('wizard.toast.promptMasterUnavailable.description'),
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(promptMasterDocument.compiled_prompt);
      addToast({
        tone: 'success',
        title: t('wizard.toast.promptMasterCopied.title'),
        description: t('wizard.toast.promptMasterCopied.description'),
      });
    } catch {
      addToast({
        tone: 'error',
        title: t('wizard.toast.copyFailed.title'),
        description: t('wizard.toast.copyFailed.description'),
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

    if (!stepAvailability[stepId] && stepId !== 'project_requirements') {
      return 'locked';
    }

    const completedStates: Record<WizardStepId, boolean> = {
      project_requirements: requirementsComplete,
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

  const currentStep = localizedWizardSteps[STEP_INDEX_BY_ID[currentStepId]];

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
    requirementsComplete,
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
      label: t('wizard.language'),
      value: previewSummary.language,
      detail:
        selectedLanguageProfile?.summary ??
        (selectedLanguage ? t('wizard.presence.ecosystemSuffix', { ecosystem: selectedLanguage.ecosystem }) : t('wizard.presence.selectLanguageToBegin')),
      tone: selectedLanguageProfile?.ecosystem.includes('JVM')
        ? 'accent'
        : selectedLanguageProfile?.ecosystem.includes('Python')
          ? 'accent2'
          : selectedLanguageProfile
            ? 'success'
            : 'muted',
    },
    {
      label: t('wizard.runtime'),
      value: previewSummary.runtime,
      detail: selectedRuntime?.performance_profile ?? t('wizard.presence.runtimeProfile'),
      tone: 'accent2',
    },
    {
      label: t('wizard.framework'),
      value: previewSummary.framework,
      detail: selectedFramework?.framework_type ?? t('wizard.presence.frameworkTopology'),
      tone: 'success',
    },
    {
      label: t('wizard.architecture'),
      value: previewSummary.architecture,
      detail: selectedArchitecture?.scalability_profile ?? t('wizard.presence.architectureProfile'),
      tone: 'muted',
    },
  ] as const;

  const frameworkPresenceMessage = useMemo(() => {
    if (!selectedFrameworkSpecialistProfile) {
      return selectedLanguageProfile
        ? t('wizard.presence.frameworkGuidanceReady', { language: selectedLanguageProfile.name })
        : t('wizard.presence.reservedLayer');
    }

    if (frameworkId === 'spring_boot') return t('wizard.presence.springBootSpecialistLoaded');
    if (frameworkId === 'nestjs') return t('wizard.presence.nestjsArchitectureGuidance');
    if (frameworkId === 'fastapi') return t('wizard.presence.fastapiAiServiceReady');

    return t('wizard.presence.specialistProfileReady', { framework: selectedFrameworkSpecialistProfile.framework_name });
  }, [frameworkId, selectedFrameworkSpecialistProfile, selectedLanguageProfile?.name, t]);
  const infrastructurePresenceMessage = useMemo(() => {
    if (!infrastructureRecommendations) {
      return t('wizard.presence.infrastructureProfileReady');
    }

    if (frameworkId === 'spring_boot' && architectureId === 'microservices') {
      return t('wizard.presence.springBootEnterpriseBaseline');
    }

    if (frameworkId === 'fastapi' && (capabilityIds.includes('ai_chat') || capabilityIds.includes('rag'))) {
      return t('wizard.presence.fastapiAiInfraAvailable');
    }

    return t('wizard.presence.infrastructureProfileReady');
  }, [architectureId, capabilityIds, frameworkId, infrastructureRecommendations, t]);
  const dependencyPresenceMessage = useMemo(() => {
    if (!dependencyGraphSnapshot) {
      return t('wizard.presence.dependencyPropagationActive');
    }

    if (capabilityIds.includes('ai_chat') || capabilityIds.includes('rag')) {
      return t('wizard.presence.aiInfrastructureMutation');
    }

    if (architectureId === 'microservices') {
      return t('wizard.presence.microservicesComplexityIncreased');
    }

    if ((dependencyReadiness?.score ?? dependencyGraphSnapshot.readiness_profile.score) > 0) {
      return t('wizard.presence.readinessScoreRecalculated');
    }

    return t('wizard.presence.operationalBurdenIncreased');
  }, [architectureId, capabilityIds, dependencyGraphSnapshot, dependencyReadiness?.score, t]);
  const engineeringPresenceMessage = useMemo(() => {
    if (!engineeringReadiness) {
      return null;
    }

    if (engineeringReadiness.team_recommendation.required_seniority === 'senior_plus' && engineeringReadiness.team_size >= 7) {
      return t('wizard.presence.enterpriseTeamProfileDetected');
    }

    if (architectureId === 'microservices') {
      return t('wizard.presence.microservicesRequirePlatformMaturity');
    }

    if (engineeringReadiness.operational_burden.level === 'high' || engineeringReadiness.operational_burden.level === 'enterprise') {
      return t('wizard.presence.operationalBurdenIncreased');
    }

    return t('wizard.presence.productionReadinessRecalculated');
  }, [architectureId, engineeringReadiness, t]);
  const topologyPresenceMessage = useMemo(() => {
    if (!dependencyGraphPayload) return null;
    if (infrastructureComponentIds.includes('kafka')) return t('wizard.presence.kafkaIncreasesOperationalBurden');
    if (infrastructureComponentIds.includes('kubernetes')) return t('wizard.presence.kubernetesRequiresSre');
    if (capabilityIds.includes('payments')) return t('wizard.presence.paymentEdgeRequiresAudit');
    if (dependencyRisks?.issues.length) return t('wizard.presence.riskZonesRecalculated');
    if (dependencyGraphSnapshot?.propagation.required_node_ids.length) return t('wizard.presence.dependencyPropagationVisualized');
    if (architecturalGraphPayload) return t('wizard.presence.architecturalGraphSynchronized');
    if (dependencyGraphSnapshot) return t('wizard.presence.runtimeTopologySynchronized');
    if (infrastructureComponentIds.length) return t('wizard.presence.operationalTopologyActive');
    if (architectureId) return t('wizard.presence.architectureGraphUpdated');
    return t('wizard.presence.operationalTopologyActive');
  }, [architectureId, architecturalGraphPayload, capabilityIds, dependencyGraphPayload, dependencyGraphSnapshot, dependencyGraphSnapshot?.propagation.required_node_ids.length, dependencyRisks?.issues.length, infrastructureComponentIds, infrastructureComponentIds.length, t]);

  const ldcnContext = useMemo(
    () =>
      ({
        route: '/wizard',
        page_title: selectedLanguageProfile ? t('wizard.presence.domainJourney', { language: selectedLanguageProfile.name }) : t('wizard.presence.architectureJourney'),
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
              ? t('wizard.toast.gatekeeperBlocked.title')
              : gatekeeperReport?.decision === 'approved_with_warnings'
                ? t('wizard.presence.approvedWithWarnings')
              : gatekeeperReport?.decision === 'approved'
                  ? t('wizard.presence.approvedAndReady')
                  : dependencyGraphSnapshot
                    ? topologyPresenceMessage ?? engineeringPresenceMessage ?? dependencyPresenceMessage
                    : infrastructureRecommendations
                    ? infrastructurePresenceMessage
                  : selectedFrameworkSpecialistProfile
                    ? frameworkPresenceMessage
                    : selectedLanguageProfile
                      ? t('wizard.presence.observingEcosystem', { language: selectedLanguageProfile.name })
                      : t('wizard.presence.topologyUnderObservation'),
          detail:
            gatekeeperReport?.summary ??
            selectedFrameworkSpecialistProfile?.summary ??
            t('wizard.presence.pipelineDetail'),
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
                    ? t('wizard.presence.infrastructureProfileInSideRail')
                  : selectedFrameworkSpecialistProfile?.summary
                    ? t('wizard.presence.frameworkSpecialistGuidanceInSideRail')
                    : t('wizard.presence.frameworkRecommendationsInSideRail')
              }`
            : t('wizard.presence.reservedLayer')),
        suggestions: [
          {
            id: 'ldcn-wizard-review',
            action: 'review_blueprint',
            label: t('wizard.presence.suggestionReviewBlueprint'),
            summary: t('wizard.presence.suggestionReviewBlueprintSummary'),
            reserved: true,
          },
          {
            id: 'ldcn-wizard-gatekeeper',
            action: 'inspect_gatekeeper',
            label: t('wizard.presence.suggestionInspectGatekeeper'),
            summary: t('wizard.presence.suggestionInspectGatekeeperSummary'),
            reserved: true,
          },
          {
            id: 'ldcn-wizard-palette',
            action: 'open_command_palette',
            label: t('wizard.presence.suggestionOpenCommandPalette'),
            summary: t('wizard.presence.suggestionOpenCommandPaletteSummary'),
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
      t,
    ],
  );

  useEffect(() => {
    useLDCNStore.getState().setPresenceState(ldcnContext.status);
    useLDCNStore.getState().setContext(ldcnContext);
  }, [ldcnContext]);

  return (
    <div className="space-y-12">
      <SectionHeader
        title={t('shell.wizard.title')}
        description={t('shell.wizard.subtitle')}
      />

      <Disclosure
        title={t('wizard.architectureIntelligence')}
        description={t('wizard.architectureIntelligenceDescription')}
        badge={<Badge>{journeyScore}%</Badge>}
      >
      <section className="cinematic-surface relative overflow-hidden rounded-[var(--radius-xl)] border border-[color:var(--border)] p-5 md:p-6">
        <div className="ambient-grid pointer-events-none absolute inset-0 opacity-25" />
        <div className="cinematic-gradient-motion pointer-events-none absolute inset-0" />
        <div className="relative grid gap-5 xl:grid-cols-[1.12fr_0.88fr] xl:items-center">
          <div className="grid gap-4">
            <div className="max-w-3xl">
              <Badge className="w-fit border-[color-mix(in_srgb,var(--accent)_26%,transparent)] bg-white/5">
                {t('wizard.hero.badge')}
              </Badge>
              <h2 className="mt-3 text-3xl font-semibold text-[color:var(--text)] md:text-4xl">
                {t('wizard.hero.title')}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[color:var(--muted)] md:text-base">
                {t('wizard.hero.description')}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">{t('wizard.hero.badgeTechnologyGraph')}</Badge>
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">{t('wizard.hero.badgeArchitectureProfile')}</Badge>
              <Badge className="border-[color-mix(in_srgb,var(--accent)_22%,transparent)] bg-white/5">{t('wizard.hero.badgeComplexityProfile')}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <SurfaceLabel
                icon={<SurfaceIcon icon={Sparkles} />}
                label={t('wizard.language')}
                value={previewSummary.language}
                detail={selectedLanguage ? selectedLanguage.ecosystem : t('wizard.hero.noLanguageSelected')}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Activity} />}
                label={t('wizard.runtime')}
                value={previewSummary.runtime}
                detail={selectedRuntime?.performance_profile ?? t('wizard.hero.pendingRuntimeProfile')}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Database} />}
                label={t('wizard.framework')}
                value={previewSummary.framework}
                detail={selectedFramework?.framework_type ?? t('wizard.hero.frameworkTopology')}
              />
              <SurfaceLabel
                icon={<SurfaceIcon icon={Layers3} />}
                label={t('wizard.architecture')}
                value={previewSummary.architecture}
                detail={selectedArchitecture?.scalability_profile ?? t('wizard.hero.architectureProfileDetail')}
              />
            </div>

            <OperationalRail
              title={t('wizard.hero.journeyIntelligence')}
              items={[
                {
                  label: t('wizard.hero.journey'),
                  value: `${journeyScore}%`,
                  detail: currentStep.title,
                  tone: journeyTone,
                },
                {
                  label: t('wizard.hero.complexity'),
                  value: String(backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score),
                  detail: backendBlueprint?.complexity_profile.risk_level ?? t(complexityEstimate.key),
                  tone: 'accent2',
                },
                {
                  label: t('wizard.validation'),
                  value: validationStatus === 'valid' ? t('wizard.hero.ready') : validationStatus === 'invalid' ? t('wizard.hero.attention') : validationStatus,
                  detail: t('wizard.hero.blueprintPreviewSurface'),
                  tone: validationStatus === 'valid' ? 'success' : validationStatus === 'invalid' ? 'warning' : 'muted',
                },
                {
                  label: t('wizard.gatekeeper'),
                  value: gatekeeperStatus === 'valid' ? t('wizard.hero.approved') : gatekeeperStatus === 'warning' ? t('wizard.hero.warnings') : gatekeeperStatus === 'invalid' ? t('wizard.hero.blocked') : gatekeeperStatus,
                  detail: t('wizard.hero.governedProgression'),
                  tone: gatekeeperToneFromStatus(gatekeeperStatus),
                },
              ]}
            />
          </div>

          <div className="grid gap-4">
            <ArchitectureGraphSurface
              title={t('wizard.hero.topologySurface')}
              subtitle={t('wizard.hero.topologySubtitle')}
              nodes={architectureGraphNodes}
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ReadinessRing
                title={t('wizard.hero.journeyReadiness')}
                value={journeyScore}
                label={currentStep.title}
                caption={t('wizard.hero.journeyReadinessCaption')}
                tone={journeyTone}
              />
              <StackEcosystemMap
                title={t('wizard.hero.stackEcosystem')}
                nodes={[
                  {
                    label: t('wizard.archetype'),
                    value: previewSummary.archetype,
                    detail: selectedArchetype?.preview_type ?? t('wizard.hero.archetypePreview'),
                    tone: 'accent',
                  },
                  {
                    label: t('wizard.modules'),
                    value: previewSummary.modules,
                    detail: t('wizard.hero.businessModuleGrouping'),
                    tone: 'accent2',
                  },
                  {
                    label: t('wizard.endpoints'),
                    value: previewSummary.endpoints,
                    detail: t('wizard.hero.routeOwnershipSelection'),
                    tone: 'success',
                  },
                  {
                    label: t('wizard.hero.localeLabel'),
                    value: locale,
                    detail: t('wizard.hero.localeContractDetail'),
                    tone: 'muted',
                  },
                ]}
              />
            </div>
          </div>
        </div>
      </section>
      </Disclosure>

      <SurfaceDivider />

      <div className="grid min-w-0 gap-6 xl:grid-cols-[15rem_minmax(0,1fr)] 2xl:grid-cols-[15rem_minmax(0,1fr)_minmax(20rem,24rem)]">
        <Card className="h-fit min-w-0 p-4 md:p-5">
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
                {t('wizard.progress')}
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                {t('wizard.progressDescription')}
              </p>
            </div>

            <nav aria-label={t('wizard.rail.navLabel')}>
              <ol className="space-y-2">
                {localizedWizardSteps.map((step, index) => {
                  const state = getStepState(step.id);
                  const isNavigable = state !== 'locked';
                  const isActive = currentStepId === step.id;
                  const isDone = index < (STEP_INDEX_BY_ID[currentStepId] ?? 0);
                  return (
                    <li key={step.id}>
                      <button
                        id={createTriggerId(step.id)}
                        type="button"
                        aria-controls={createRegionId(step.id)}
                        aria-current={isActive ? 'step' : undefined}
                        disabled={!isNavigable}
                        onClick={() => isNavigable && setCurrentStepId(step.id)}
                        className={[
                          'focus-ring flex w-full items-start gap-3 rounded-[var(--radius-lg)] border px-3 py-3 text-left transition duration-200',
                          isActive
                            ? 'border-[color-mix(in_srgb,var(--accent)_40%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]'
                            : 'border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] hover:border-[color:var(--border-strong)]',
                          !isNavigable ? 'cursor-not-allowed opacity-55' : '',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'relative mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full t-mono text-xs font-semibold',
                            isDone
                              ? 'accent-fill'
                              : isActive
                                ? 'border border-[color-mix(in_srgb,var(--accent)_55%,transparent)] text-[color:var(--accent)]'
                                : 'border border-[color:var(--border-strong)] text-[color:var(--muted)]',
                          ].join(' ')}
                        >
                          {isActive ? (
                            <span className="absolute inset-0 animate-ping rounded-full border border-[color-mix(in_srgb,var(--accent)_45%,transparent)]" aria-hidden />
                          ) : null}
                          {String(index + 1).padStart(2, '0')}
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

        <div className="min-w-0" id={createRegionId(currentStep.id)} aria-labelledby={createTriggerId(currentStep.id)}>
          {isFoundationLoading ? (
            <Card className="space-y-4 p-6">
              <CardLoading className="p-0 shadow-none" />
              <CardLoading className="p-0 shadow-none" />
              <CardLoading className="p-0 shadow-none" />
            </Card>
          ) : foundationError ? (
            <Card className="p-6">
              <PageError
                title={t('wizard.rail.technologyGraphUnavailable')}
                description={getApiErrorMessage(
                  foundationError,
                  t('wizard.rail.technologyGraphFallback'),
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
              {currentStepId === 'project_requirements' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('project_requirements')}
                  actions={
                    <Button
                      type="button"
                      variant="primary"
                      disabled={!requirementsComplete}
                      onClick={() => goToNextStep('project_requirements')}
                    >
                      {t('wizard.businessFirst.continue')}
                    </Button>
                  }
                >
                  <AiIntakePanel onApply={handleApplyProjectSpec} />
                  <SelectionGroup title={t('wizard.businessFirst.objective')} description={t('wizard.businessFirst.objective.description')}>
                    <TextField
                      label={t('wizard.businessFirst.projectName')}
                      placeholder={t('wizard.businessFirst.projectName.placeholder')}
                      value={projectName}
                      onChange={(event) => setProjectName(event.target.value)}
                      required
                    />
                    <div className="mt-4">
                      <span className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.businessFirst.goalPicker.label')}</span>
                      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {PRODUCT_GOAL_OPTIONS.map((option) => (
                          <Button key={option} type="button" variant={projectGoal === t(`wizard.businessFirst.goal.${option}`) ? 'primary' : 'secondary'} onClick={() => setProjectGoal(t(`wizard.businessFirst.goal.${option}`))}>
                            {t(`wizard.businessFirst.goal.${option}`)}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </SelectionGroup>
                  <SelectionGroup title={t('wizard.businessFirst.problem')} description={t('wizard.businessFirst.problem.description')}>
                    <TextareaField label={t('wizard.businessFirst.problem.label')} value={businessContext} onChange={(event) => setBusinessContext(event.target.value)} required />
                  </SelectionGroup>
                  <SelectionGroup title={t('wizard.businessFirst.users')} description={t('wizard.businessFirst.users.description')}>
                    <div className="flex flex-wrap gap-3">
                      {TARGET_USER_OPTIONS.map((option) => {
                        const label = t(`wizard.businessFirst.user.${option}`);
                        return <Button key={option} type="button" variant={splitRequirements(targetUsers).includes(label) ? 'primary' : 'secondary'} onClick={() => toggleTargetUser(label)}>{label}</Button>;
                      })}
                    </div>
                  </SelectionGroup>
                  <SelectionGroup title={t('wizard.businessFirst.rules')} description={t('wizard.businessFirst.rules.description')}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <TextareaField label={t('wizard.businessFirst.rules.label')} description={t('wizard.businessFirst.onePerLine')} value={businessRules} onChange={(event) => setBusinessRules(event.target.value)} required />
                      <TextareaField label={t('wizard.businessFirst.workflows.label')} description={t('wizard.businessFirst.onePerLine')} value={workflows} onChange={(event) => setWorkflows(event.target.value)} required />
                    </div>
                  </SelectionGroup>
                  <SelectionGroup title={t('wizard.businessFirst.data')} description={t('wizard.businessFirst.data.description')}>
                    <div className="grid gap-5 md:grid-cols-2">
                      <TextareaField label={t('wizard.businessFirst.entities')} description={t('wizard.businessFirst.entities.description')} value={entities} onChange={(event) => setEntities(event.target.value)} required />
                      <TextareaField label={t('wizard.businessFirst.constraints')} description={t('wizard.businessFirst.constraints.description')} value={constraints} onChange={(event) => setConstraints(event.target.value)} required />
                    </div>
                  </SelectionGroup>
                  <SelectionGroup title={t('wizard.businessFirst.delivery')} description={t('wizard.businessFirst.delivery.description')}>
                    <SelectField label={t('wizard.businessFirst.delivery.label')} value={deliveryTarget} onChange={(event) => setDeliveryTarget(event.target.value as typeof deliveryTarget)} required>
                      <option value="">{t('wizard.businessFirst.delivery.select')}</option>
                      <option value="github">{t('wizard.businessFirst.delivery.github')}</option>
                      <option value="gitlab">{t('wizard.businessFirst.delivery.gitlab')}</option>
                      <option value="both">{t('wizard.businessFirst.delivery.both')}</option>
                      <option value="zip">{t('wizard.businessFirst.delivery.zip')}</option>
                    </SelectField>
                    {!requirementsComplete ? (
                      <p className="rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_35%,transparent)] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] p-4 text-sm text-[color:var(--warning)]">
                        {t('wizard.businessFirst.incomplete')}
                      </p>
                    ) : null}
                  </SelectionGroup>
                </StepShell>
              ) : null}

              {currentStepId === 'technology_path' ? (
                <StepShell
                  step={currentStep}
                  stepState={getStepState('technology_path')}
                  actions={
                    <>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => goToPreviousStep('technology_path')}
                      >
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!technologyPathComplete}
                        onClick={() => goToNextStep('technology_path')}
                      >
                        {t('wizard.continueArchitecture')}
                      </Button>
                      <ActionLink href="/projects" variant="secondary">
                        {t('wizard.reviewProjects')}
                      </ActionLink>
                    </>
                  }
                >
                  {aiSuggestedStack ? (
                    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--accent)_28%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_7%,transparent)] p-4 text-sm text-[color:var(--muted)]">
                      <Sparkles className="h-4 w-4 text-[color:var(--accent)]" aria-hidden />
                      <span className="font-semibold text-[color:var(--text)]">{t('wizard.intake.stackSuggestionLabel')}</span>
                      <span>{aiSuggestedStack}</span>
                      {pendingAiStackSpec ? (
                        <Button type="button" variant="soft" className="ml-auto" onClick={() => setPendingAiStackSpec({ ...pendingAiStackSpec })}>
                          {t('wizard.intake.applySuggestedStack')}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                  <SelectionGroup
                    title={t('wizard.chooseTechnologySpine')}
                    description={t('wizard.chooseTechnologySpineDescription')}
                  >
                    <div className="grid gap-5 xl:grid-cols-3">
                      <ChoiceField
                        label={t('wizard.languageField')}
                        description={t('wizard.programmingEcosystem')}
                        value={languageId}
                        onChange={handleLanguageChange}
                        options={languagesQuery.data ?? []}
                      />

                      {languageId ? (
                        <ChoiceField
                          label={t('wizard.runtimeField')}
                          description={t('wizard.executionEnvironment')}
                          value={runtimeId}
                          onChange={handleRuntimeChange}
                          options={availableRuntimes}
                        />
                      ) : (
                        <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                          {t('wizard.runtimeUnlocks')}
                        </div>
                      )}

                      {runtimeId ? (
                        <ChoiceField
                          label={t('wizard.frameworkField')}
                          description={t('wizard.deliveryFramework')}
                          value={frameworkId}
                          onChange={handleFrameworkChange}
                          options={availableFrameworks}
                        />
                      ) : (
                        <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                          {t('wizard.frameworkUnlocks')}
                        </div>
                      )}
                    </div>
                  </SelectionGroup>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <SelectionGroup
                      title={t('wizard.languageProfile')}
                      description={t('wizard.languageProfileDescription')}
                    >
                      <div className="space-y-2 text-sm text-[color:var(--muted)]">
                        <p>{selectedLanguageProfile?.summary ?? selectedLanguage?.description ?? t('wizard.selectLanguageEcosystem')}</p>
                        <p>
                          {t('wizard.ecosystem')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.ecosystem ?? selectedLanguage?.ecosystem ?? t('wizard.pending')}
                          </span>
                        </p>
                        <p>
                          {t('wizard.primaryUseCases')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.primary_use_cases.join(', ') || t('wizard.pending')}
                          </span>
                        </p>
                        <p>
                          {t('wizard.enterpriseScore')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.enterprise_score ?? selectedLanguage?.enterprise_score ?? t('wizard.pending')}
                          </span>
                        </p>
                        <p>
                          {t('wizard.learningCurve')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.learning_curve ?? selectedLanguage?.learning_curve ?? t('wizard.pending')}
                          </span>
                        </p>
                        <p>
                          {t('wizard.scalability')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile?.scalability_profile ?? selectedLanguage?.scalability_profile ?? t('wizard.pending')}
                          </span>
                        </p>
                        <p>
                          {t('wizard.frameworkArchitectureCapabilities')}:{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {selectedLanguageProfile
                              ? `${selectedLanguageProfile.framework_count} / ${selectedLanguageProfile.architecture_count} / ${selectedLanguageProfile.capability_count}`
                              : t('wizard.pending')}
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
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!architectureComplete}
                        onClick={() => goToNextStep('architecture')}
                      >
                        {t('wizard.steps.continueToProjectType')}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.steps.architectureTitle')}
                    description={t('wizard.steps.architectureDescription')}
                  >
                    <div className="space-y-5">
                      <ChoiceField
                        label={t('wizard.steps.architectureLabel')}
                        description={t('wizard.steps.architectureFieldDescription')}
                        value={architectureId}
                        onChange={handleArchitectureChange}
                        options={availableArchitectures}
                      />

                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.steps.architectureProfileTitle')}</p>
                        <p className="mt-3">{selectedArchitecture?.description ?? t('wizard.steps.architectureProfilePlaceholder')}</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.steps.complexityLabel')}</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{selectedArchitecture?.complexity_level?.replaceAll('_', ' ') ?? t('wizard.complexity.pending')}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.steps.scalabilityLabel')}</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{selectedArchitecture?.scalability_profile ?? t('wizard.complexity.pending')}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.steps.deploymentLabel')}</p>
                            <p className="mt-1 font-semibold text-[color:var(--text)]">{selectedArchitecture?.deployment_complexity ?? t('wizard.complexity.pending')}</p>
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
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!projectTypeComplete}
                        onClick={() => goToNextStep('project_type')}
                      >
                        {t('wizard.steps.continueToCapabilities')}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.steps.projectTypeTitle')}
                    description={t('wizard.steps.projectTypeDescription')}
                  >
                    <div className="space-y-5">
                      <ChoiceField
                        label={t('wizard.steps.archetypeLabel')}
                        description={t('wizard.steps.archetypeFieldDescription')}
                        value={archetypeId}
                        onChange={handleArchetypeChange}
                        options={filteredArchetypes}
                      />

                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.steps.archetypeProfileTitle')}</p>
                        <p className="mt-3">{selectedArchetype?.description ?? t('wizard.steps.archetypeProfilePlaceholder')}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <Badge>{selectedArchetype?.category ?? t('wizard.complexity.pending')}</Badge>
                          <Badge>{selectedArchetype?.preview_type ?? t('wizard.complexity.pending')}</Badge>
                          <Badge>
                            {t('wizard.steps.complexityLabel')} {selectedArchetype ? `${selectedArchetype.complexity_range.minimum}-${selectedArchetype.complexity_range.maximum}` : t('wizard.complexity.pending')}
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
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!capabilitiesComplete}
                        onClick={() => goToNextStep('capabilities')}
                      >
                        {t('wizard.steps.continueToBusinessModules')}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.recommendedCapabilitiesFirst')}
                    description={t('wizard.steps.capabilitiesDescription')}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        <Badge>{t('wizard.steps.selectedCount', { count: capabilityIds.length })}</Badge>
                        <Badge>{t('wizard.steps.recommendedCount', { count: recommendedCapabilities.length })}</Badge>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        aria-expanded={showAdvancedCapabilities}
                        aria-controls="advanced-capabilities-region"
                        onClick={() => setShowAdvancedCapabilities((current) => !current)}
                      >
                        {showAdvancedCapabilities ? t('wizard.steps.hideAdvancedCapabilities') : t('wizard.steps.viewAdvancedCapabilities')}
                      </Button>
                    </div>

                    {recommendedCapabilities.length ? (
                      <div className="space-y-3">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.steps.recommendedForBlueprint')}</p>
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
                        {t('wizard.steps.noRecommendedCapabilities')}
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
                            {CAPABILITY_CATEGORY_KEYS[category] ? t(CAPABILITY_CATEGORY_KEYS[category]) : category}
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
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!modulesComplete}
                        onClick={() => goToNextStep('business_modules')}
                      >
                        {t('wizard.steps.continueToEndpoints')}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.steps.businessModulesTitle')}
                    description={t('wizard.steps.businessModulesDescription')}
                  >
                    <div className="space-y-5">
                      {groupedModules.map(([category, modules]) => (
                        <div key={category} className="space-y-3">
                          <div className="flex items-center gap-3">
                            <p className="text-sm font-semibold text-[color:var(--text)]">
                              {MODULE_CATEGORY_KEYS[category] ? t(MODULE_CATEGORY_KEYS[category]) : category}
                            </p>
                            <Badge>{modules.length}</Badge>
                          </div>
                          <div className="grid gap-3 md:grid-cols-2">
                            {modules.map((module) => (
                              <div key={module.id} className="relative">
                                {recommendedModuleIds.has(module.id) ? (
                                  <Badge className="absolute right-3 top-3 border-[color-mix(in_srgb,var(--accent)_34%,transparent)] text-[color:var(--text)]">
                                    {t('wizard.steps.recommendedBadge')}
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
                        {t('wizard.steps.back')}
                      </Button>
                      <Button
                        type="button"
                        variant="primary"
                        disabled={!endpointsComplete}
                        onClick={() => goToNextStep('endpoints')}
                      >
                        {t('wizard.continueBlueprint')}
                      </Button>
                    </>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.steps.endpointsTitle')}
                    description={t('wizard.steps.endpointsDescription')}
                  >
                    {selectedModules.length === 0 ? (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        {t('wizard.steps.selectModuleFirst')}
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
                                  <Badge>{t('wizard.steps.routesCount', { count: moduleEndpoints.length })}</Badge>
                                  <Badge>{t('wizard.steps.recommendedCount', { count: module.default_endpoints.filter((item) => moduleEndpoints.some((endpoint) => endpoint.id === item)).length })}</Badge>
                                </div>
                              </button>

                              <div id={accordionRegionId} hidden={!isOpen} className="space-y-4 border-t border-white/10 px-5 py-4">
                                <div className="flex flex-wrap gap-3">
                                  <Button type="button" variant="soft" onClick={() => selectModuleEndpoints(module, 'recommended')}>
                                    {t('wizard.steps.selectRecommended')}
                                  </Button>
                                  <Button type="button" variant="secondary" onClick={() => selectModuleEndpoints(module, 'all')}>
                                    {t('wizard.steps.selectAllInModule')}
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
                    <Button type="button" variant="secondary" onClick={() => goToPreviousStep('blueprint_review')}>
                      {t('wizard.steps.back')}
                    </Button>
                  }
                >
                  <SelectionGroup
                    title={t('wizard.review.title')}
                    description={t('wizard.review.description')}
                  >
                    <div className="grid gap-4 lg:grid-cols-3">
                      <TextField
                        label={t('wizard.review.projectNameLabel')}
                        description={t('wizard.review.projectNameDescription')}
                        value={projectName}
                        onChange={(event) => setProjectName(event.target.value)}
                      />
                      <SelectField
                        label={t('wizard.review.localeLabel')}
                        description={t('wizard.review.localeDescription')}
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
                        label={t('wizard.review.generationModeLabel')}
                        description={t('wizard.review.generationModeDescription')}
                        value={generationMode}
                        onChange={(event) => setGenerationMode(event.target.value as (typeof GENERATION_MODE_OPTIONS)[number]['value'])}
                      >
                        {GENERATION_MODE_OPTIONS.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {t(`wizard.generationMode.${mode.value}`)}
                          </option>
                        ))}
                      </SelectField>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-4">
                      <LlmToolCard
                        title={t('wizard.tools.blueprint.title')}
                        description={t('wizard.tools.blueprint.description')}
                        prerequisites={[
                          t('wizard.tools.prereq.requirements'),
                          t('wizard.tools.prereq.stack'),
                          t('wizard.tools.prereq.scope'),
                        ]}
                        state={blueprintToolState}
                        stateLabel={t(`wizard.tools.state.${blueprintToolState}`)}
                        actionLabel={t('wizard.button.previewBlueprint')}
                        loadingLabel={t('wizard.button.buildingBlueprintPreview')}
                        onAction={previewCurrentBlueprint}
                        disabled={blueprintPreviewMutation.isPending}
                        error={
                          blueprintPreviewMutation.isError
                            ? getApiErrorMessage(
                                blueprintPreviewMutation.error,
                                t('wizard.review.blueprintPreviewFailedFallback'),
                              )
                            : null
                        }
                        result={
                          backendBlueprint ? (
                            <div className="space-y-2">
                              <p className="font-semibold text-[color:var(--text)]">
                                {backendBlueprint.validation.valid
                                  ? t('wizard.tools.blueprint.valid')
                                  : t('wizard.tools.blueprint.warning')}
                              </p>
                              <p>
                                {t('wizard.tools.blueprint.result', {
                                  errors: backendBlueprint.validation.errors.length,
                                  warnings: backendBlueprint.validation.warnings.length,
                                  recommendations: backendBlueprint.recommendations.length,
                                })}
                              </p>
                            </div>
                          ) : null
                        }
                      />
                      <LlmToolCard
                        title={t('wizard.tools.promptMaster.title')}
                        description={t('wizard.tools.promptMaster.description')}
                        prerequisites={[
                          t('wizard.tools.prereq.blueprint'),
                          t('wizard.tools.prereq.validation'),
                        ]}
                        state={promptMasterToolState}
                        stateLabel={t(`wizard.tools.state.${promptMasterToolState}`)}
                        actionLabel={t('wizard.previewPromptMaster')}
                        loadingLabel={t('wizard.button.buildingPromptMaster')}
                        onAction={previewPromptMaster}
                        disabled={!backendBlueprint || promptMasterPreviewMutation.isPending}
                        error={
                          promptMasterPreviewMutation.isError
                            ? getApiErrorMessage(
                                promptMasterPreviewMutation.error,
                                t('wizard.review.promptMasterPreviewFailedFallback'),
                              )
                            : null
                        }
                        result={
                          promptMasterDocument ? (
                            <div className="space-y-3">
                              <p className="font-semibold text-[color:var(--text)]">
                                {t('wizard.tools.promptMaster.result', {
                                  sections: promptMasterDocument.sections.length,
                                  warnings: promptMasterDocument.validation.warnings.length,
                                })}
                              </p>
                              <Button
                                type="button"
                                variant="soft"
                                onClick={() => void copyPromptMaster()}
                                disabled={!promptMasterDocument}
                              >
                                {t('wizard.button.copyPromptMaster')}
                              </Button>
                            </div>
                          ) : null
                        }
                      />
                      <LlmToolCard
                        title={t('wizard.tools.gatekeeper.title')}
                        description={t('wizard.tools.gatekeeper.description')}
                        prerequisites={[
                          t('wizard.tools.prereq.blueprint'),
                          t('wizard.tools.prereq.promptMaster'),
                        ]}
                        state={gatekeeperToolState}
                        stateLabel={t(`wizard.tools.state.${gatekeeperToolState}`)}
                        actionLabel={t('wizard.runGatekeeper')}
                        loadingLabel={t('wizard.button.runningGatekeeper')}
                        onAction={runGatekeeper}
                        disabled={!promptMasterDocument || gatekeeperPreviewMutation.isPending}
                        error={
                          gatekeeperPreviewMutation.isError
                            ? getApiErrorMessage(
                                gatekeeperPreviewMutation.error,
                                t('wizard.review.gatekeeperPreviewFailedFallback'),
                              )
                            : null
                        }
                        result={
                          gatekeeperReport ? (
                            <div className="space-y-2">
                              <p className="font-semibold text-[color:var(--text)]">{gatekeeperReport.decision}</p>
                              <p>
                                {t('wizard.tools.gatekeeper.result', {
                                  checks: gatekeeperReport.checks.length,
                                  blockers: gatekeeperReport.blockers.length,
                                  warnings: gatekeeperReport.warnings.length,
                                })}
                              </p>
                            </div>
                          ) : null
                        }
                      />
                      <LlmToolCard
                        title={t('wizard.tools.save.title')}
                        description={t('wizard.tools.save.description')}
                        prerequisites={[
                          t('wizard.tools.prereq.blueprint'),
                          t('wizard.tools.prereq.promptMaster'),
                          t('wizard.tools.prereq.gatekeeper'),
                        ]}
                        state={saveToolState}
                        stateLabel={t(`wizard.tools.state.${saveToolState}`)}
                        actionLabel={t('wizard.button.saveProject')}
                        loadingLabel={t('wizard.button.savingProject')}
                        onAction={saveProject}
                        disabled={
                          !gatekeeperReport ||
                          gatekeeperReport.decision === 'blocked' ||
                          saveProjectMutation.isPending
                        }
                        error={
                          saveProjectMutation.isError
                            ? getApiErrorMessage(
                                saveProjectMutation.error,
                                t('wizard.review.projectSaveFailedFallback'),
                              )
                            : null
                        }
                        result={
                          savedProject ? (
                            <p>
                              {t('wizard.tools.save.result', {
                                projectId: savedProject.project_id,
                              })}
                            </p>
                          ) : null
                        }
                      />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.review.complexityEstimateTitle')}</p>
                        <p className="mt-3 text-3xl font-semibold text-[color:var(--text)]">
                          {backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}
                        </p>
                        <p className="mt-2">
                          {backendBlueprint?.complexity_profile.risk_level ?? t(complexityEstimate.key)}
                        </p>
                        <p className="mt-4">
                          {t('wizard.review.architectureComplexity')}{' '}
                          <span className="font-semibold text-[color:var(--text)]">
                            {(backendBlueprint?.technology_graph.architecture.complexity_level ?? selectedArchitecture?.complexity_level)?.replaceAll('_', ' ') ?? t('wizard.complexity.pending')}
                          </span>
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.review.validationStatusTitle')}</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {validationStatus === 'loading'
                            ? t('wizard.review.validationBuilding')
                            : validationStatus === 'valid'
                              ? t('wizard.review.validationHealthy')
                              : validationStatus === 'invalid'
                                ? t('wizard.review.validationAttention')
                                : validationStatus === 'error'
                                  ? t('wizard.review.validationFailed')
                                  : t('wizard.review.validationEmpty')}
                        </p>
                        <p className="mt-2">
                          {validationStatus === 'empty'
                            ? t('wizard.review.validationDescEmpty')
                            : validationStatus === 'valid'
                              ? t('wizard.review.validationDescValid')
                              : validationStatus === 'loading'
                                ? t('wizard.review.validationDescLoading')
                                : t('wizard.review.validationDescError')}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)] md:col-span-2">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.review.promptMasterStatusTitle')}</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {promptMasterStatus === 'loading'
                            ? t('wizard.review.promptMasterBuilding')
                            : promptMasterStatus === 'valid'
                              ? t('wizard.review.promptMasterReady')
                              : promptMasterStatus === 'invalid'
                                ? t('wizard.review.promptMasterAttention')
                                : promptMasterStatus === 'error'
                                  ? t('wizard.review.promptMasterFailed')
                                  : t('wizard.review.promptMasterStatusEmpty')}
                        </p>
                        <p className="mt-2">
                          {promptMasterStatus === 'empty'
                            ? t('wizard.review.promptMasterDescEmpty')
                            : promptMasterStatus === 'loading'
                              ? t('wizard.review.promptMasterDescLoading')
                              : promptMasterStatus === 'valid'
                                ? t('wizard.review.promptMasterDescValid')
                                : promptMasterStatus === 'invalid'
                                  ? t('wizard.review.promptMasterDescInvalid')
                                  : t('wizard.review.promptMasterDescError')}
                        </p>
                      </div>
                      <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)] md:col-span-2">
                        <p className="font-semibold text-[color:var(--text)]">{t('wizard.review.gatekeeperStatusTitle')}</p>
                        <p className="mt-3 font-semibold text-[color:var(--text)]">
                          {gatekeeperStatus === 'loading'
                            ? t('wizard.review.gatekeeperRunning')
                            : gatekeeperStatus === 'valid'
                              ? t('wizard.review.gatekeeperApproved')
                              : gatekeeperStatus === 'warning'
                                ? t('wizard.review.gatekeeperApprovedWarnings')
                                : gatekeeperStatus === 'invalid'
                                  ? t('wizard.review.gatekeeperBlocked')
                                  : gatekeeperStatus === 'error'
                                    ? t('wizard.review.gatekeeperFailed')
                                    : t('wizard.review.gatekeeperStatusEmpty')}
                        </p>
                        <p className="mt-2">
                          {gatekeeperStatus === 'empty'
                            ? t('wizard.review.gatekeeperDescEmpty')
                            : gatekeeperStatus === 'loading'
                              ? t('wizard.review.gatekeeperDescLoading')
                              : gatekeeperStatus === 'valid'
                                ? t('wizard.review.gatekeeperDescValid')
                                : gatekeeperStatus === 'warning'
                                  ? t('wizard.review.gatekeeperDescWarning')
                                  : gatekeeperStatus === 'invalid'
                                    ? t('wizard.review.gatekeeperDescInvalid')
                                    : t('wizard.review.gatekeeperDescError')}
                        </p>
                      </div>
                    </div>

                    {/* The review step used to stack all four intelligence panels
                        vertically (~13k px of graphs/radars/cockpits below the
                        validation cards), forcing one long scroll to see any of
                        them. They have no shared state, so a tab switcher only
                        mounts the active one's heavy visuals at a time. */}
                    <Tabs
                      items={[
                        {
                          id: 'dependencies',
                          label: t('wizard.review.tabs.dependencies'),
                          icon: Activity,
                          content: (
                            <DependencyGraphPanel
                              snapshot={dependencyGraphSnapshot}
                              impact={dependencyImpact}
                              readiness={dependencyReadiness}
                              risks={dependencyRisks}
                              isLoading={dependencyGraphQuery.isLoading || impactAnalysisQuery.isLoading || readinessAnalysisQuery.isLoading || riskAnalysisQuery.isLoading}
                              errorMessage={
                                dependencyGraphQuery.isError || impactAnalysisQuery.isError || readinessAnalysisQuery.isError || riskAnalysisQuery.isError
                                  ? t('wizard.review.dependencyGraphOffline')
                                  : null
                              }
                            />
                          ),
                        },
                        {
                          id: 'architecture-graph',
                          label: t('wizard.review.tabs.architectureGraph'),
                          icon: GitBranch,
                          content: (
                            <ArchitecturalGraphCanvas
                              payload={architecturalGraphPayload}
                              title={t('wizard.review.architecturalGraphTitle')}
                              offlineMessage={t('wizard.review.architecturalGraphOffline')}
                            />
                          ),
                        },
                        {
                          id: 'cockpit',
                          label: t('wizard.review.tabs.cockpit'),
                          icon: Gauge,
                          content: (
                            <VisualizationCockpit
                              payload={dependencyGraphPayload}
                              offlineMessage={t('wizard.review.visualizationOffline')}
                            />
                          ),
                        },
                        {
                          id: 'readiness',
                          label: t('wizard.review.tabs.readiness'),
                          icon: ShieldCheck,
                          content: (
                            <EngineeringReadinessPanel
                              readiness={engineeringReadiness}
                              team={teamProfileQuery.data ?? null}
                              delivery={deliveryEstimateQuery.data ?? null}
                              isLoading={engineeringReadinessQuery.isLoading || teamProfileQuery.isLoading || deliveryEstimateQuery.isLoading}
                              errorMessage={
                                engineeringReadinessQuery.isError || teamProfileQuery.isError || deliveryEstimateQuery.isError
                                  ? t('wizard.review.engineeringReadinessOffline')
                                  : null
                              }
                            />
                          ),
                        },
                      ]}
                    />

                    {blueprintPreviewMutation.isError ? (
                      <PageError
                        title={t('wizard.review.blueprintPreviewFailedTitle')}
                        description={getApiErrorMessage(
                          blueprintPreviewMutation.error,
                          t('wizard.review.blueprintPreviewFailedFallback'),
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
                          <Badge>{backendBlueprint.validation.valid ? t('wizard.validBlueprint') : t('wizard.blueprintIssues')}</Badge>
                          <Badge>{backendBlueprint.validation.errors.length} {t('common.errors')}</Badge>
                          <Badge>{backendBlueprint.validation.warnings.length} {t('common.warnings')}</Badge>
                          <Badge>{backendBlueprint.recommendations.length} {t('common.recommendations')}</Badge>
                        </div>

                        {backendBlueprint.validation.errors.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.errorsHeading')}</p>
                            {backendBlueprint.validation.errors.map((item) => (
                              <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                            ))}
                          </div>
                        ) : null}

                        {backendBlueprint.validation.warnings.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.warningsHeading')}</p>
                            {backendBlueprint.validation.warnings.map((item) => (
                              <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                            ))}
                          </div>
                        ) : null}

                        {backendBlueprint.validation.suggestions.length ? (
                          <div className="space-y-2 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.suggestionsHeading')}</p>
                            {backendBlueprint.validation.suggestions.map((suggestion) => (
                              <p key={suggestion} className="text-sm text-[color:var(--muted)]">{suggestion}</p>
                            ))}
                          </div>
                        ) : null}

                        <div className="grid gap-3 md:grid-cols-4">
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.technologyGraphSnapshotTitle')}</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.technologyGraphSnapshotDesc')}</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.architectureProfileSnapshotTitle')}</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.architectureProfileSnapshotDesc')}</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.complexityProfileSnapshotTitle')}</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.complexityProfileSnapshotDesc')}</p>
                          </div>
                          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                            <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.infrastructureProfileSnapshotTitle')}</p>
                            <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.infrastructureProfileSnapshotDesc')}</p>
                          </div>
                        </div>

                        <ReviewDisclosure
                          title={t('wizard.review.stackPathTitle')}
                          description={t('wizard.review.stackPathDesc')}
                          defaultOpen
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.language')}</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.language.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.runtime')}</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.runtime.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.framework')}</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.framework.name}</p>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.architecture')}</p>
                              <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{backendBlueprint.technology_graph.architecture.name}</p>
                            </div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title={t('wizard.review.architectureProfileDetailsTitle')}
                          description={t('wizard.review.architectureProfileDetailsDesc')}
                        >
                          <div className="space-y-3 text-sm text-[color:var(--muted)]">
                            <p>{t('wizard.review.scalabilityProfile')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.scalability_profile}</span></p>
                            <p>{t('wizard.review.deploymentComplexity')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.deployment_complexity}</span></p>
                            <p>{t('wizard.review.requiredInfrastructure')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.required_infrastructure.join(', ') || 'none'}</span></p>
                            <p>{t('wizard.review.recommendedPatterns')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.architecture_profile.recommended_patterns.join(', ') || 'none'}</span></p>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title={t('wizard.review.infrastructureProfileDetailsTitle')}
                          description={t('wizard.review.infrastructureProfileDetailsDesc')}
                        >
                          <div className="space-y-4 text-sm text-[color:var(--muted)]">
                            <div>
                              <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.review.selectedFoundation')}</p>
                              <div className="mt-2 flex flex-wrap gap-2">
                                {selectedInfrastructureComponents.length ? (
                                  selectedInfrastructureComponents.map((component) => (
                                    <Badge key={component.id} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                      {component.name}
                                    </Badge>
                                  ))
                                ) : (
                                  <span className="text-[color:var(--muted)]">{t('wizard.review.noFoundationSelected')}</span>
                                )}
                              </div>
                            </div>
                            <div className="grid gap-3 md:grid-cols-3">
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.review.requiredLabel')}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.required_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.required_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>{t('wizard.review.noRequiredItems')}</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.review.recommendedLabel')}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.recommended_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.recommended_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>{t('wizard.review.noRecommendedItems')}</span>
                                  )}
                                </div>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('wizard.review.optionalLabel')}</p>
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {backendBlueprint.infrastructure_profile.optional_component_ids.length ? (
                                    backendBlueprint.infrastructure_profile.optional_component_ids.map((componentId) => (
                                      <Badge key={componentId} className="border-white/10 bg-white/[0.04] text-[color:var(--text)]">
                                        {infrastructureComponentNameById.get(componentId) ?? componentId}
                                      </Badge>
                                    ))
                                  ) : (
                                    <span>{t('wizard.review.noOptionalItems')}</span>
                                  )}
                                </div>
                              </div>
                            </div>
                            {backendBlueprint.infrastructure_profile.warnings.length ? (
                              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3">
                                <p className="text-xs uppercase tracking-[0.18em] text-[color:var(--muted)]">{t('common.warnings')}</p>
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
                          title={t('wizard.review.complexityProfileDetailsTitle')}
                          description={t('wizard.review.complexityProfileDetailsDesc')}
                        >
                          <div className="grid gap-3 md:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.learningCurveLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.learning_curve}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.implementationEffortLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.implementation_effort}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.infrastructureCostLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.infrastructure_cost}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.maintenanceCostLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.maintenance_cost}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.teamRecommendationLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.team_size_recommendation}</span></div>
                            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">{t('wizard.review.riskLevelLabel')} <span className="font-semibold text-[color:var(--text)]">{backendBlueprint.complexity_profile.risk_level}</span></div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title={t('wizard.review.modulesEndpointsTitle')}
                          description={t('wizard.review.modulesEndpointsDesc')}
                        >
                          <div className="grid gap-4 lg:grid-cols-2">
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.businessModulesLabel')}</p>
                              {backendBlueprint.business_modules.map((module) => (
                                <div key={module.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">
                                  <span className="font-semibold text-[color:var(--text)]">{module.name}</span> {module.description}
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.endpointsLabel')}</p>
                              {backendBlueprint.endpoints.map((endpoint) => (
                                <div key={endpoint.id} className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-[color:var(--muted)]">
                                  <span className="font-semibold text-[color:var(--text)]">{endpoint.method} {endpoint.path}</span> {endpoint.description}
                                </div>
                              ))}
                            </div>
                          </div>
                        </ReviewDisclosure>

                        <ReviewDisclosure
                          title={t('wizard.review.recommendationsTitle')}
                          description={t('wizard.review.recommendationsDesc')}
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
                            <p className="text-sm text-[color:var(--muted)]">{t('wizard.review.noRecommendations')}</p>
                          )}
                        </ReviewDisclosure>

                        {promptMasterPreviewMutation.isError ? (
                          <PageError
                            title={t('wizard.review.promptMasterPreviewFailedTitle')}
                            description={getApiErrorMessage(
                              promptMasterPreviewMutation.error,
                              t('wizard.review.promptMasterPreviewFailedFallback'),
                            )}
                            onRetry={previewPromptMaster}
                            className="p-4"
                          />
                        ) : null}

                        {promptMasterPreviewMutation.isPending ? (
                          <CardLoading className="p-0 shadow-none" />
                        ) : promptMasterDocument ? (
                          <SelectionGroup
                            title={t('wizard.review.promptMasterPreviewTitle')}
                            description={t('wizard.review.promptMasterPreviewDesc')}
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{promptMasterDocument.validation.valid ? t('wizard.review.validPromptMasterBadge') : t('wizard.review.promptMasterIssuesBadge')}</Badge>
                              <Badge>{t('wizard.review.sectionsCount', { count: promptMasterDocument.sections.length })}</Badge>
                              <Badge>{t('wizard.review.errorsCount', { count: promptMasterDocument.validation.errors.length })}</Badge>
                              <Badge>{t('wizard.review.warningsCount', { count: promptMasterDocument.validation.warnings.length })}</Badge>
                            </div>

                            {promptMasterDocument.validation.errors.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.promptMasterErrorsHeading')}</p>
                                {promptMasterDocument.validation.errors.map((item) => (
                                  <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                                ))}
                              </div>
                            ) : null}

                            {promptMasterDocument.validation.warnings.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.promptMasterWarningsHeading')}</p>
                                {promptMasterDocument.validation.warnings.map((item) => (
                                  <p key={item.code} className="text-sm text-[color:var(--muted)]">{item.message}</p>
                                ))}
                              </div>
                            ) : null}

                            {promptMasterDocument.validation.constraints.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.constraintsHeading')}</p>
                                {promptMasterDocument.validation.constraints.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.promptMasterSectionsTitle')}</p>
                              <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.promptMasterSectionsDesc')}</p>
                            </div>

                            <ReviewDisclosure
                              title={t('wizard.review.promptMasterSectionsDetailsTitle')}
                              description={t('wizard.review.promptMasterSectionsDetailsDesc')}
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
                              title={t('wizard.review.promptMasterTraceTitle')}
                              description={t('wizard.review.promptMasterTraceDesc')}
                            >
                              <div className="space-y-3 text-sm text-[color:var(--muted)]">
                                <p>
                                  {t('wizard.review.blueprintIdLabel')}{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.blueprint_id}
                                  </span>
                                </p>
                                <p>
                                  {t('wizard.review.includedSectionsLabel')}{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.included_sections.join(', ')}
                                  </span>
                                </p>
                                <p>
                                  {t('wizard.review.redactedFieldsLabel')}{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.redacted_fields.join(', ')}
                                  </span>
                                </p>
                                <p>
                                  {t('wizard.review.containsSecretsLabel')}{' '}
                                  <span className="font-semibold text-[color:var(--text)]">
                                    {promptMasterDocument.trace.contains_secrets ? t('wizard.review.yes') : t('wizard.review.no')}
                                  </span>
                                </p>
                              </div>
                            </ReviewDisclosure>

                            <ReviewDisclosure
                              title={t('wizard.review.compiledPromptMasterTitle')}
                              description={t('wizard.review.compiledPromptMasterDesc')}
                            >
                              <pre className="overflow-x-auto whitespace-pre-wrap rounded-[var(--radius-xl)] border border-white/10 bg-black/20 p-4 text-xs leading-6 text-[color:var(--muted)]">
                                {promptMasterDocument.compiled_prompt}
                              </pre>
                            </ReviewDisclosure>
                          </SelectionGroup>
                        ) : (
                          <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                            {t('wizard.review.promptMasterPreviewEmpty')}
                          </div>
                        )}

                        {gatekeeperPreviewMutation.isError ? (
                          <PageError
                            title={t('wizard.review.gatekeeperPreviewFailedTitle')}
                            description={getApiErrorMessage(
                              gatekeeperPreviewMutation.error,
                              t('wizard.review.gatekeeperPreviewFailedFallback'),
                            )}
                            onRetry={runGatekeeper}
                            className="p-4"
                          />
                        ) : null}

                        {gatekeeperPreviewMutation.isPending ? (
                          <CardLoading className="p-0 shadow-none" />
                        ) : gatekeeperReport ? (
                          <SelectionGroup
                            title={t('wizard.review.gatekeeperReportTitle')}
                            description={t('wizard.review.gatekeeperReportDesc')}
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{gatekeeperReport.decision}</Badge>
                              <Badge>{t('wizard.review.checksCount', { count: gatekeeperReport.checks.length })}</Badge>
                              <Badge>{t('wizard.review.blockersCount', { count: gatekeeperReport.blockers.length })}</Badge>
                              <Badge>{t('wizard.review.warningsCount', { count: gatekeeperReport.warnings.length })}</Badge>
                            </div>

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4 text-sm text-[color:var(--muted)]">
                              <p className="font-semibold text-[color:var(--text)]">{t('wizard.review.decisionSummary')}</p>
                              <p className="mt-2">{gatekeeperReport.summary}</p>
                            </div>

                            <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
                              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.gatekeeperChecksTitle')}</p>
                              <p className="mt-2 text-sm text-[color:var(--muted)]">{t('wizard.review.gatekeeperChecksDesc')}</p>
                            </div>

                            {gatekeeperReport.blockers.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--danger)_34%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.blockersHeading')}</p>
                                {gatekeeperReport.blockers.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            {gatekeeperReport.warnings.length ? (
                              <div className="space-y-2 rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-white/5 p-4">
                                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.review.warningsHeading')}</p>
                                {gatekeeperReport.warnings.map((item) => (
                                  <p key={item} className="text-sm text-[color:var(--muted)]">{item}</p>
                                ))}
                              </div>
                            ) : null}

                            <ReviewDisclosure
                              title={t('wizard.review.gatekeeperChecksDetailsTitle')}
                              description={t('wizard.review.gatekeeperChecksDetailsDesc')}
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
                                          <p key={item} className="text-sm text-[color:var(--muted)]">{t('wizard.review.blockerPrefix')} {item}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                    {check.warnings.length ? (
                                      <div className="mt-3 space-y-2">
                                        {check.warnings.map((item) => (
                                          <p key={item} className="text-sm text-[color:var(--muted)]">{t('wizard.review.warningPrefix')} {item}</p>
                                        ))}
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </ReviewDisclosure>

                            <ReviewDisclosure
                              title={t('wizard.review.gatekeeperTraceTitle')}
                              description={t('wizard.review.gatekeeperTraceDesc')}
                            >
                              <div className="space-y-3 text-sm text-[color:var(--muted)]">
                                <p>
                                  {t('wizard.review.blueprintIdLabel')} <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.blueprint_id}</span>
                                </p>
                                <p>
                                  {t('wizard.review.promptMasterIdLabel')} <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.prompt_master_id}</span>
                                </p>
                                <p>
                                  {t('wizard.review.checksLabel')} <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.check_ids.join(', ')}</span>
                                </p>
                                <p>
                                  {t('wizard.review.redactedFieldsLabel')} <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.redacted_fields.join(', ')}</span>
                                </p>
                                <p>
                                  {t('wizard.review.containsSecretsLabel')} <span className="font-semibold text-[color:var(--text)]">{gatekeeperReport.trace.contains_secrets ? t('wizard.review.yes') : t('wizard.review.no')}</span>
                                </p>
                              </div>
                            </ReviewDisclosure>
                          </SelectionGroup>
                        ) : (
                          <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                            {t('wizard.review.gatekeeperReportEmpty')}
                          </div>
                        )}

                        {saveProjectMutation.isError ? (
                          <PageError
                            title={t('wizard.review.projectSaveFailedTitle')}
                            description={getApiErrorMessage(
                              saveProjectMutation.error,
                              t('wizard.review.projectSaveFailedFallback'),
                            )}
                            onRetry={saveProject}
                            className="p-4"
                          />
                        ) : null}

                        {savedProject ? (
                          <SelectionGroup
                            title={t('wizard.review.projectSavedTitle')}
                            description={t('wizard.review.projectSavedDesc')}
                          >
                            <div className="flex flex-wrap gap-2">
                              <Badge>{savedProject.status}</Badge>
                              <Badge>{savedProject.readiness_status}</Badge>
                            </div>
                            <p className="text-sm text-[color:var(--muted)]">
                              {t('wizard.review.projectIdLabel')} <span className="font-semibold text-[color:var(--text)]">{savedProject.project_id}</span>
                            </p>
                            <div className="flex flex-wrap gap-3">
                              <ActionLink href={`/projects/${savedProject.project_id}`} variant="primary">
                                {t('wizard.review.openProjectDetails')}
                              </ActionLink>
                              <ActionLink href="/projects" variant="secondary">
                                {t('wizard.review.openProjectRegistry')}
                              </ActionLink>
                            </div>
                          </SelectionGroup>
                        ) : null}
                      </div>
                    ) : (
                      <div className="rounded-[var(--radius-xl)] border border-dashed border-white/10 bg-white/5 p-5 text-sm text-[color:var(--muted)]">
                        {t('wizard.review.blueprintPreviewEmpty')}
                      </div>
                    )}
                  </SelectionGroup>
                </StepShell>
              ) : null}
            </>
          )}
        </div>

        <Card className="col-span-full h-fit min-w-0 space-y-5 p-5 2xl:col-span-1 2xl:sticky 2xl:top-24" data-visibility-audit="wizard-right-rail">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-[color:var(--muted)]">
              {t('wizard.blueprintPreview')}
            </p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              {t('wizard.blueprintPreviewDescription')}
            </p>
          </div>

          {languageId ? (
            <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">
                  {selectedLanguageProfile ? t('wizard.rail.languageRecommendations', { language: selectedLanguageProfile.name }) : t('wizard.rail.languageRecommendationsFallback')}
                </p>
                <Badge>{languageRecommendationsQuery.data?.length ?? 0}</Badge>
              </div>
              {languageRecommendationsQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">{t('wizard.rail.loadingRecommendations')}</p>
              ) : languageRecommendationsQuery.isError ? (
                <p className="text-sm text-[color:var(--muted)]">
                  {t('wizard.rail.recommendationsFeedOffline')}
                </p>
              ) : languageRecommendationsQuery.isEmpty ? (
                <p className="text-sm text-[color:var(--muted)]">{t('wizard.rail.noRecommendations')}</p>
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
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.rail.compatibleTemplates')}</p>
                <Badge>{compatibleTemplateRecommendations.length}</Badge>
              </div>
              {recommendedTemplatesQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">{t('wizard.rail.validatingTemplates')}</p>
              ) : recommendedTemplatesQuery.isError ? (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  {t('wizard.rail.templateRecommendationsOffline')}
                </p>
              ) : compatibleTemplateRecommendations.length ? (
                <div className="grid gap-2">
                  {compatibleTemplateRecommendations.slice(0, 3).map((recommendation) => (
                    <div key={recommendation.template.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-[color:var(--text)]">{recommendation.template.name}</p>
                        <Badge>{t('wizard.rail.matchPercent', { score: recommendation.compatibility?.score ?? 0 })}</Badge>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
                        {t('wizard.rail.matchedTemplate', { matched: recommendation.compatibility?.matched.join(', ') || 'template metadata' })}
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
                  {t('wizard.rail.noCompatibleTemplates')}
                </p>
              )}
              <div className="grid gap-2 text-xs text-[color:var(--muted)]">
                <span>{t('wizard.rail.templateCompatibilityValidated')}</span>
                <span>{compatibleTemplateRecommendations.length ? t('wizard.rail.recommendedTemplateDetected') : t('wizard.rail.recommendedTemplatePending')}</span>
                <span>{t('wizard.rail.templateMaturityVerified')}</span>
              </div>
            </div>
          ) : null}

          {templateSelectionPayload ? (
            <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4" data-testid="wizard-skills-panel">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.rail.skillsUnlocked')}</p>
                <Badge>{recommendedSkillsQuery.data?.filter((skill) => skill.unlocked).length ?? 0}</Badge>
              </div>
              {recommendedSkillsQuery.isLoading ? (
                <p className="text-sm text-[color:var(--muted)]">{t('wizard.rail.syncingSkillRegistry')}</p>
              ) : recommendedSkillsQuery.isError ? (
                <p className="text-sm leading-6 text-[color:var(--muted)]">
                  {t('wizard.rail.skillRegistryOffline')}
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
            stepLabel={t('wizard.currentStep', { step: currentStep.title })}
            actions={['explain_current_page', 'review_blueprint', 'inspect_gatekeeper']}
          />

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-white/5 p-4">
            <PreviewRow label={t('wizard.language')} value={previewSummary.language} />
            <PreviewRow label={t('wizard.runtime')} value={previewSummary.runtime} />
            <PreviewRow label={t('wizard.framework')} value={previewSummary.framework} />
            <PreviewRow label={t('wizard.architecture')} value={previewSummary.architecture} />
            <PreviewRow label={t('wizard.archetype')} value={previewSummary.archetype} />
            <PreviewRow label={t('wizard.capabilities')} value={previewSummary.capabilities} />
            <PreviewRow label={t('wizard.modules')} value={previewSummary.modules} />
            <PreviewRow label={t('wizard.endpoints')} value={previewSummary.endpoints} />
          </div>

          <Disclosure title={t('wizard.advancedComplexity')} description={t('wizard.advancedComplexityDescription')}>
          <ComplexityRadar
            title={t('wizard.rail.complexityRadarTitle')}
            score={backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}
            axes={[
              {
                label: t('wizard.rail.axisLearningCurve'),
                value:
                  backendBlueprint?.complexity_profile.learning_curve === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.learning_curve === 'medium'
                      ? 52
                      : 80,
              },
              {
                label: t('wizard.rail.axisImplementation'),
                value:
                  backendBlueprint?.complexity_profile.implementation_effort === 'low'
                    ? 26
                    : backendBlueprint?.complexity_profile.implementation_effort === 'medium'
                      ? 55
                      : 84,
              },
              {
                label: t('wizard.rail.axisInfrastructure'),
                value:
                  backendBlueprint?.complexity_profile.infrastructure_cost === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.infrastructure_cost === 'medium'
                      ? 58
                      : 86,
              },
              {
                label: t('wizard.rail.axisMaintenance'),
                value:
                  backendBlueprint?.complexity_profile.maintenance_cost === 'low'
                    ? 24
                    : backendBlueprint?.complexity_profile.maintenance_cost === 'medium'
                      ? 56
                      : 82,
              },
              {
                label: t('wizard.rail.axisRisk'),
                value:
                  backendBlueprint?.complexity_profile.risk_level === 'low'
                    ? 22
                    : backendBlueprint?.complexity_profile.risk_level === 'medium'
                      ? 50
                      : 80,
              },
            ]}
          />
          </Disclosure>

          <SurfaceDivider />

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.complexityEstimate')}</p>
              <Badge>{backendBlueprint?.complexity_profile.overall_score ?? complexityEstimate.score}</Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {backendBlueprint?.complexity_profile.risk_level ?? t('wizard.leanBlueprint')}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.validation')}</p>
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
                {statusLabel(validationStatus)}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {validationStatus === 'empty'
                ? t('wizard.validationPending')
                : validationStatus === 'loading'
                  ? t('wizard.rail.validationBuildingNow')
                  : validationStatus === 'valid'
                    ? t('wizard.rail.validationCurrentValid')
                    : validationStatus === 'invalid'
                      ? t('wizard.rail.validationWarningsFound')
                      : t('wizard.rail.validationRequestFailed')}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.promptMaster')}</p>
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
                {statusLabel(promptMasterStatus)}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {promptMasterStatus === 'empty'
                ? t('wizard.promptMasterPending')
                : promptMasterStatus === 'loading'
                  ? t('wizard.rail.promptMasterBuildingNow')
                  : promptMasterStatus === 'valid'
                    ? t('wizard.rail.promptMasterPreviewReady')
                    : promptMasterStatus === 'invalid'
                      ? t('wizard.rail.promptMasterBlueprintIssues')
                      : t('wizard.rail.promptMasterRequestFailed')}
            </p>
          </div>

          <div className="space-y-3 rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[color:var(--text)]">{t('wizard.gatekeeper')}</p>
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
                {statusLabel(gatekeeperStatus)}
              </Badge>
            </div>
            <p className="text-sm text-[color:var(--muted)]">
              {gatekeeperStatus === 'empty'
                ? t('wizard.gatekeeperPending')
                : gatekeeperStatus === 'loading'
                  ? t('wizard.rail.gatekeeperRunningNow')
                  : gatekeeperStatus === 'valid'
                    ? t('wizard.rail.gatekeeperApprovedPair')
                    : gatekeeperStatus === 'warning'
                      ? t('wizard.rail.gatekeeperApprovedWithWarnings')
                      : gatekeeperStatus === 'invalid'
                        ? t('wizard.rail.gatekeeperBlockedProgression')
                        : t('wizard.rail.gatekeeperRequestFailed')}
            </p>
          </div>

          <div className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 p-4 text-xs leading-6 text-[color:var(--muted)]">
            {t('wizard.nextStep')}: <span className="font-semibold text-[color:var(--text)]">{currentStep.title}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
