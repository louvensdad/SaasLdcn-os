import type { ProjectSpec } from '@/lib/api/meta-factory';
import type { Architecture, Framework, Language, Runtime } from '@/lib/api/types';

/** Free-text fields of the wizard's Step 1, seeded from an AI ProjectSpec. */
export interface RequirementFields {
  readonly projectGoal: string;
  readonly businessContext: string;
  readonly targetUsers: string;
  readonly businessRules: string;
  readonly entities: string;
  readonly workflows: string;
  readonly constraints: string;
}

/**
 * Maps an AI `ProjectSpec` onto the wizard's Step 1 text fields. The wizard
 * splits multi-value fields on newlines/commas (`splitRequirements`), so arrays
 * are joined with newlines.
 */
export function specToRequirementFields(spec: ProjectSpec): RequirementFields {
  const nonFunctional = Object.entries(spec.non_functional ?? {}).map(
    ([key, value]) => `${key}: ${value}`,
  );

  return {
    projectGoal: spec.product_summary?.trim() || spec.raw_intent?.trim() || '',
    businessContext: spec.raw_intent?.trim() || spec.product_summary?.trim() || '',
    targetUsers: (spec.target_users ?? []).join('\n'),
    businessRules: (spec.business_rules ?? []).join('\n'),
    entities: (spec.entities ?? []).join('\n'),
    workflows: (spec.core_workflows ?? []).join('\n'),
    constraints: nonFunctional.join('\n'),
  };
}

export interface StackRegistries {
  readonly languages: readonly Language[];
  readonly runtimes: readonly Runtime[];
  readonly frameworks: readonly Framework[];
  readonly architectures: readonly Architecture[];
}

export interface MatchedStack {
  readonly languageId: string | null;
  readonly runtimeId: string | null;
  readonly frameworkId: string | null;
  readonly architectureId: string | null;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Best-effort match of a display name to a registry id (exact, then contains). */
export function findRegistryId(items: ReadonlyArray<{ id: string; name: string }>, needle: string | undefined): string | null {
  if (!needle) return null;
  const target = normalize(needle);
  if (!target) return null;

  const exact = items.find((item) => normalize(item.id) === target || normalize(item.name) === target);
  if (exact) return exact.id;

  const partial = items.find((item) => {
    const name = normalize(item.name);
    const id = normalize(item.id);
    return name.includes(target) || target.includes(name) || id.includes(target) || target.includes(id);
  });
  return partial?.id ?? null;
}

/**
 * Resolves the AI's suggested stack (display names like "TypeScript", "NestJS")
 * to concrete registry ids, scoping runtimes to the matched language and
 * frameworks to the matched runtime. Any field may be null — the caller applies
 * what matched and leaves the rest for manual selection.
 */
export function matchSuggestedStack(spec: ProjectSpec, registries: StackRegistries): MatchedStack {
  const stack = spec.suggested_stack;
  const languageId = findRegistryId(registries.languages, stack?.language);

  const scopedRuntimes = languageId
    ? registries.runtimes.filter((runtime) => runtime.language_id === languageId)
    : registries.runtimes;
  const runtimeId = findRegistryId(scopedRuntimes, stack?.runtime);

  const scopedFrameworks = runtimeId
    ? registries.frameworks.filter((framework) => framework.runtime_id === runtimeId)
    : registries.frameworks;
  const frameworkId = findRegistryId(scopedFrameworks, stack?.framework);

  const architectureId = findRegistryId(registries.architectures, stack?.architecture);

  return { languageId, runtimeId, frameworkId, architectureId };
}
