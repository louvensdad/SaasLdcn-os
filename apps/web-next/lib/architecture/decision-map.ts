import type { ArchitectureBlueprint, BlueprintDecision } from '@contracts/architecture-blueprint.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';

/**
 * The architecture map of a blueprint: the requirements the architect cited on the left, then one card per decision
 * in layers — experience, contract and access, core, data and operations. An arrow points from a decision to what it
 * depends on; a dependency whose text names no decided area stays in the inspector as written, never as an invented
 * node.
 */
export interface RequirementData {
  readonly kind: 'requirement';
  readonly text: string;
  readonly decisions: readonly string[];
}

export interface DecisionData {
  readonly kind: 'decision';
  readonly decision: BlueprintDecision;
  /** Dependencies that name a decided area, resolved; the rest, verbatim. */
  readonly resolved: readonly string[];
  readonly unresolved: readonly string[];
}

export interface LayerData {
  readonly kind: 'layer';
  readonly layer: Layer;
}

export type MapData = RequirementData | DecisionData | LayerData;
export type Layer = 'requirements' | 'experience' | 'contract' | 'core' | 'data';

const LAYER_OF: Readonly<Record<string, Layer>> = {
  frontend: 'experience', mobile: 'experience',
  apis: 'contract', auth: 'contract', authorization: 'contract', integrations: 'contract',
  backend: 'core',
  database: 'data', observability: 'data', tests: 'data', deploy: 'data',
};
export const LAYERS: readonly Layer[] = ['requirements', 'experience', 'contract', 'core', 'data'];
const X: Readonly<Record<Layer, number>> = { requirements: 0, experience: 320, contract: 600, core: 880, data: 1160 };
const W = 240;
const DECISION_H = 64;
const REQUIREMENT_H = 52;
const GAP = 16;

const decisionId = (area: string) => `decision:${area}`;

/** The areas a dependency's text names, as whole words: "Auth/Authorization" names both, "Locale from the spec" none. */
export function namedAreas(dependency: string, areas: readonly string[]): readonly string[] {
  const words = dependency.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return areas.filter((area) => words.includes(area.toLowerCase()));
}

export function layoutDecisionMap(blueprint: ArchitectureBlueprint, labels: { readonly decision: (decision: BlueprintDecision) => string; readonly requirement: (text: string) => string }): {
  readonly nodes: readonly GraphNode<MapData>[];
  readonly edges: readonly GraphEdge[];
} {
  const decisions = Array.isArray(blueprint.decisions) ? blueprint.decisions : [];
  const areas = decisions.map((decision) => decision.area);
  const nodes: GraphNode<MapData>[] = [];
  const edges: GraphEdge[] = [];

  const requirements = new Map<string, string[]>();
  for (const decision of decisions) {
    for (const link of decision.requirement_links ?? []) {
      requirements.set(link, [...(requirements.get(link) ?? []), decision.area]);
    }
  }

  const columns = new Map<Layer, GraphNode<MapData>[]>();
  const push = (layer: Layer, node: GraphNode<MapData>) => columns.set(layer, [...(columns.get(layer) ?? []), node]);

  [...requirements.entries()].forEach(([text, linked], i) => {
    push('requirements', { id: `requirement:${i}`, x: X.requirements, y: 0, w: W, h: REQUIREMENT_H, label: labels.requirement(text), data: { kind: 'requirement', text, decisions: linked } });
  });
  for (const decision of decisions) {
    const resolved = [...new Set((decision.dependencies ?? []).flatMap((dependency) => namedAreas(dependency, areas)))].filter((area) => area !== decision.area);
    const unresolved = (decision.dependencies ?? []).filter((dependency) => namedAreas(dependency, areas).length === 0);
    push(LAYER_OF[decision.area] ?? 'contract', {
      id: decisionId(decision.area), x: 0, y: 0, w: W, h: DECISION_H, label: labels.decision(decision),
      data: { kind: 'decision', decision, resolved, unresolved },
    });
  }

  /* Each column is centred on the tallest one, so the eye reads across rather than down. */
  const heights = LAYERS.map((layer) => (columns.get(layer) ?? []).reduce((sum, node) => sum + node.h + GAP, -GAP));
  const tallest = Math.max(0, ...heights);
  LAYERS.forEach((layer, index) => {
    let y = (tallest - Math.max(0, heights[index]!)) / 2;
    for (const node of columns.get(layer) ?? []) {
      nodes.push({ ...node, x: X[layer], y });
      y += node.h + GAP;
    }
    nodes.push({ id: `layer:${layer}`, x: X[layer], y: -44, w: W, h: 22, data: { kind: 'layer', layer } });
  });

  [...requirements.entries()].forEach(([, linked], i) => {
    for (const area of new Set(linked)) edges.push({ from: `requirement:${i}`, to: decisionId(area), orient: 'h', className: 'e-proof', arrow: false });
  });
  for (const node of nodes) {
    if (node.data.kind !== 'decision') continue;
    for (const area of node.data.resolved) edges.push({ from: node.id, to: decisionId(area), orient: 'auto', className: 'e-reports' });
  }
  return { nodes, edges };
}
