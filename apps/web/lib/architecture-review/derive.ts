import type { ProjectRoom, ProjectRoomStatus } from '@contracts/project-room.contract';
import type { ArchitectureBlueprint, BlueprintDecision } from '@contracts/architecture-blueprint.contract';

// ---------------------------------------------------------------------------
// Architecture Review derivations.
//
// CONTRACT: every value here is derived ONLY from real data already present on
// the ProjectRoom (its spec) and its ArchitectureBlueprint. Nothing is invented.
// When a value cannot be derived, it is returned as `null` and the UI renders
// "Informação ainda indisponível" — never a fabricated number, score or risk.
// ---------------------------------------------------------------------------

/** A value that is either real (T) or honestly unavailable (null). */
export type Maybe<T> = T | null;

export interface ExecutiveSummary {
  project: string;
  summary: Maybe<string>;
  architecture: Maybe<string>;
  backend: Maybe<string>;
  frontend: Maybe<string>;
  database: Maybe<string>;
  cloud: Maybe<string>;
  /** Qualitative band derived from real counts, with the basis made explicit. */
  complexity: Maybe<{ band: 'low' | 'medium' | 'high'; basis: { entities: number; workflows: number; rules: number; users: number } }>;
  /** Spec confidence (0..100), real. */
  readinessPct: Maybe<number>;
  /** Whether a real LLM authored the blueprint, or it's the deterministic preview. */
  origin: 'ai' | 'deterministic' | null;
}

function decisionFor(blueprint: ArchitectureBlueprint | null, area: string): Maybe<string> {
  const decision = blueprint?.decisions.find((d) => d.area === area);
  return decision ? decision.choice : null;
}

export function deriveExecutiveSummary(room: ProjectRoom): ExecutiveSummary {
  const spec = room.spec;
  const bp = room.architecture_blueprint;
  const stack = spec?.suggested_stack ?? {};

  const entities = spec?.entities.length ?? 0;
  const workflows = spec?.core_workflows.length ?? 0;
  const rules = spec?.business_rules.length ?? 0;
  const users = spec?.target_users.length ?? 0;
  const complexityScore = entities + workflows + rules + users;
  const complexity = spec
    ? {
        band: (complexityScore <= 8 ? 'low' : complexityScore <= 18 ? 'medium' : 'high') as 'low' | 'medium' | 'high',
        basis: { entities, workflows, rules, users },
      }
    : null;

  return {
    project: room.title,
    summary: spec?.product_summary?.trim() || null,
    architecture: decisionFor(bp, 'backend') ? null : (stack.architecture ?? null), // prefer a real blueprint decision below
    backend: decisionFor(bp, 'backend') ?? stack.framework ?? stack.language ?? null,
    frontend: decisionFor(bp, 'frontend') ?? null,
    database: decisionFor(bp, 'database') ?? null,
    cloud: decisionFor(bp, 'deploy') ?? null,
    complexity,
    readinessPct: spec ? Math.round((spec.confidence ?? room.confidence ?? 0) * 100) : null,
    origin: bp ? (bp.degraded ? 'deterministic' : 'ai') : null,
  };
}

// Override architecture to use the stack value directly (kept simple + real).
export function deriveArchitectureLabel(room: ProjectRoom): Maybe<string> {
  return room.spec?.suggested_stack?.architecture ?? null;
}

// ---------------------------------------------------------------------------
// Engineering readiness — coverage-based, NOT invented quality scores.
// ---------------------------------------------------------------------------

const ALL_AREAS = ['frontend', 'backend', 'database', 'auth', 'authorization', 'apis', 'integrations', 'observability', 'tests', 'deploy'] as const;

export interface EngineeringReadiness {
  /** How many architecture areas have an explicit decision (real coverage). */
  decidedAreas: number;
  totalAreas: number;
  decided: string[];
  missing: string[];
  /** Security posture is *presence-based*: are auth + authorization decided? */
  securityCovered: Maybe<{ covered: number; total: number }>;
  /** Spec confidence as a percentage (real). */
  confidencePct: Maybe<number>;
}

export function deriveReadiness(room: ProjectRoom): EngineeringReadiness {
  const decisions = room.architecture_blueprint?.decisions ?? [];
  const decidedSet = new Set(decisions.map((d) => d.area));
  const decided = ALL_AREAS.filter((a) => decidedSet.has(a));
  const missing = ALL_AREAS.filter((a) => !decidedSet.has(a));
  const securityAreas = ['auth', 'authorization'];
  return {
    decidedAreas: decided.length,
    totalAreas: ALL_AREAS.length,
    decided: [...decided],
    missing: [...missing],
    securityCovered: decisions.length ? { covered: securityAreas.filter((a) => decidedSet.has(a)).length, total: securityAreas.length } : null,
    confidencePct: room.spec ? Math.round((room.spec.confidence ?? room.confidence ?? 0) * 100) : null,
  };
}

// ---------------------------------------------------------------------------
// Risk Center — derived from REAL uncertainties the orchestrator flagged:
// open_questions (unresolved decisions) and assumptions (inferred values).
// No invented probability/impact scores.
// ---------------------------------------------------------------------------

export interface ReviewRisk {
  id: string;
  title: string;
  detail: Maybe<string>; // why it matters
  mitigation: Maybe<string>;
  source: 'open_question' | 'assumption';
}

export function deriveRisks(room: ProjectRoom): ReviewRisk[] {
  const spec = room.spec;
  if (!spec) return [];
  const risks: ReviewRisk[] = [];
  for (const q of spec.open_questions ?? []) {
    risks.push({
      id: `oq-${q.id}`,
      title: q.question,
      detail: q.why_it_matters || null,
      mitigation: q.default_if_skipped || null,
      source: 'open_question',
    });
  }
  for (const [index, a] of (spec.assumptions ?? []).entries()) {
    risks.push({
      id: `as-${index}`,
      title: `${a.field}: ${a.assumed_value}`,
      detail: a.reason || null,
      mitigation: null,
      source: 'assumption',
    });
  }
  return risks;
}

// ---------------------------------------------------------------------------
// Estimates — only counts that genuinely exist in the spec.
// ---------------------------------------------------------------------------

export interface Estimate {
  key: string;
  value: number;
}

export function deriveEstimates(room: ProjectRoom): Estimate[] {
  const spec = room.spec;
  if (!spec) return [];
  const items: Estimate[] = [
    { key: 'entities', value: spec.entities.length },
    { key: 'workflows', value: spec.core_workflows.length },
    { key: 'businessRules', value: spec.business_rules.length },
    { key: 'users', value: spec.target_users.length },
    { key: 'decisions', value: room.architecture_blueprint?.decisions.length ?? 0 },
    { key: 'openQuestions', value: (spec.open_questions ?? []).length },
  ];
  // Only surface non-trivial real counts; never pad with zeros that imply absence-as-data.
  return items.filter((item) => item.value > 0 || item.key === 'openQuestions');
}

// ---------------------------------------------------------------------------
// Diagram — nodes are the REAL decided areas, in a sensible request flow.
// ---------------------------------------------------------------------------

export interface DiagramNode {
  area: string;
  choice: string;
}

const FLOW_ORDER = ['frontend', 'apis', 'auth', 'authorization', 'backend', 'integrations', 'database', 'observability', 'tests', 'deploy'];

export function deriveDiagram(blueprint: ArchitectureBlueprint | null): DiagramNode[] {
  if (!blueprint) return [];
  const byArea = new Map(blueprint.decisions.map((d) => [d.area, d.choice]));
  return FLOW_ORDER.filter((area) => byArea.has(area)).map((area) => ({ area, choice: byArea.get(area) as string }));
}

// ---------------------------------------------------------------------------
// Journey timeline — derived from the real room status.
// ---------------------------------------------------------------------------

export type JourneyStepState = 'done' | 'current' | 'todo';

export interface JourneyStep {
  key: string;
  state: JourneyStepState;
}

const JOURNEY = ['projectRoom', 'promptMaster', 'architect', 'review', 'metaFactory'] as const;

// Where the room sits maps to a journey index.
function journeyIndex(status: ProjectRoomStatus): number {
  switch (status) {
    case 'DRAFT':
    case 'UNDER_REVIEW':
      return 0;
    case 'PROMPT_READY':
      return 1;
    case 'PROMPT_APPROVED':
    case 'BLUEPRINT_GENERATING':
    case 'BLUEPRINT_READY':
      return 2; // PromptMaster approved / blueprint produced → at the Architect step
    case 'ENGINEERING_REVIEW':
      return 3; // under engineering review → at the Architecture Review step
    case 'ENGINEERING_APPROVED':
    case 'WAITING_META_FACTORY':
    case 'META_FACTORY_RUNNING':
    case 'GENERATING':
    case 'VALIDATING':
    case 'READY':
      return 4; // review approved → Meta-Factory
    default:
      return 0;
  }
}

export function deriveJourney(status: ProjectRoomStatus): JourneyStep[] {
  const current = journeyIndex(status);
  return JOURNEY.map((key, index) => ({
    key,
    state: index < current ? 'done' : index === current ? 'current' : 'todo',
  }));
}

export function decisionTradeoffs(decision: BlueprintDecision): { choice: string; justification: string; alternatives: string[] } {
  return {
    choice: decision.choice,
    justification: decision.justification,
    alternatives: decision.alternatives_considered ?? [],
  };
}
