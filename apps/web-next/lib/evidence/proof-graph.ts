import type { ChiefVerificationView } from '@contracts/company.contract';
import type { EngineeringKernelStatus, KernelEvidenceItem } from '@contracts/engineering-kernel.contract';
import type { QualityGateReport } from '@contracts/quality-gate.contract';
import type { GateEvidence, TestRoomProof, TestRoomSessionView } from '@contracts/test-room.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

/**
 * The evidence graph, read right to left: the kernel's verdict rests on five pillars, and each pillar on the evidence
 * recorded for it. Evidence that was never recorded stays on the drawing, dashed — the kernel lists it with
 * `available: false` precisely so that absence is visible.
 */
export type PillarId = 'build' | 'tests' | 'quality' | 'chief' | 'completeness';
export const PILLARS: readonly PillarId[] = ['build', 'tests', 'quality', 'chief', 'completeness'];

export interface ProofEvidence {
  readonly kind: 'evidence';
  readonly id: string;
  readonly pillar: PillarId | null;
  /** Where it was recorded: the kernel's evidence list, a Test Room gate or a dimension of the chief verification. */
  readonly origin: 'kernel' | 'gate' | 'chief';
  readonly label: string;
  /** The backend's word, or `available` / `missing` for a kernel item. */
  readonly state: string;
  readonly family: Family;
  readonly detail: string | null;
  readonly source: string;
}

export interface ProofPillar {
  readonly kind: 'pillar';
  readonly id: PillarId;
  readonly state: string;
  readonly family: Family;
  readonly source: string;
}

export interface ProofVerdict {
  readonly kind: 'verdict';
  readonly phase: string;
  readonly state: string | null;
  readonly family: Family;
  readonly reason: string | null;
}

export interface ProofRelease {
  readonly kind: 'release';
  readonly state: string;
  readonly family: Family;
}

export interface ProofColumn {
  readonly kind: 'column';
  readonly column: 'evidence' | 'pillar' | 'verdict';
}

export type ProofNodeData = ProofEvidence | ProofPillar | ProofVerdict | ProofRelease | ProofColumn;

interface Read<T> {
  readonly data?: T | null;
  readonly isError: boolean;
  readonly isPending: boolean;
}

const GATE_FAMILY: Readonly<Record<string, Family>> = { observed: 'proof', failed: 'fault', not_executed: 'idle', unsupported: 'na' };
/** The chief verification's own dimension words (ok, incomplete, blocked, unavailable). */
const DIMENSION_FAMILY: Readonly<Record<string, Family>> = { ok: 'proof', incomplete: 'caution', blocked: 'fault', unavailable: 'na' };

export function kernelPillar(item: KernelEvidenceItem): PillarId | null {
  const id = item.id.toLowerCase();
  if (/build/.test(id)) return 'build';
  if (/quality|lint|security/.test(id)) return 'quality';
  if (/test|e2e|browser/.test(id)) return 'tests';
  if (/runtime|audit|complete|functional|coverage/.test(id)) return 'completeness';
  return null;
}

export function proofModel({ kernel, quality, chief, proof, sessions, words }: {
  readonly kernel: Read<EngineeringKernelStatus>;
  readonly quality: Read<QualityGateReport>;
  readonly chief: Read<ChiefVerificationView | null>;
  readonly proof: Read<TestRoomProof>;
  readonly sessions: Read<readonly TestRoomSessionView[]>;
  readonly words: { readonly available: string; readonly missing: string; readonly dimension: (name: string) => string };
}): { readonly pillars: readonly ProofPillar[]; readonly evidence: readonly ProofEvidence[]; readonly verdict: ProofVerdict; readonly release: ProofRelease } {
  const k = kernel.data ?? null;
  const q = quality.data ?? null;
  const c = chief.data ?? null;
  const p = proof.data ?? null;
  const kernelRead = 'GET /api/meta-factory/{project_id}/engineering-kernel';

  const pillars: ProofPillar[] = [
    {
      kind: 'pillar', id: 'build',
      state: k ? (k.build_verified ? 'VERIFIED' : 'NOT_VERIFIED') : 'unknown',
      family: k ? (k.build_verified ? 'proof' : 'idle') : 'unknown',
      source: `${kernelRead} · build_verified`,
    },
    {
      kind: 'pillar', id: 'tests',
      state: p ? (p.proven ? 'PROVEN' : p.latest_status ?? 'NOT_RUN') : 'unknown',
      family: p ? (p.proven ? 'proof' : p.latest_status ? familyFor(p.latest_status) : 'idle') : 'unknown',
      source: 'GET /api/test-room/{project_id}/proof · proven, latest_status',
    },
    {
      kind: 'pillar', id: 'quality',
      state: q ? (q.passed ? 'PASSED' : `${q.blocker_count} BLOCKER`) : 'unknown',
      family: q ? (q.passed ? 'proof' : 'fault') : 'unknown',
      source: 'GET /api/meta-factory/{project_id}/quality-report · passed, blocker_count',
    },
    {
      kind: 'pillar', id: 'chief',
      state: c ? c.verdict : chief.isPending || chief.isError ? 'unknown' : 'NOT_RUN',
      family: c ? familyFor(c.verdict) : chief.isPending || chief.isError ? 'unknown' : 'idle',
      source: 'GET /api/companies/by-job/{job_id}/chief · verdict',
    },
    {
      kind: 'pillar', id: 'completeness',
      state: k ? k.functional_completeness_status ?? 'NOT_RUN' : 'unknown',
      family: k ? (k.functional_completeness_status ? familyFor(k.functional_completeness_status) : 'idle') : 'unknown',
      source: `${kernelRead} · functional_completeness_status`,
    },
  ];

  const evidence: ProofEvidence[] = [];
  for (const item of k?.evidence ?? []) {
    evidence.push({
      kind: 'evidence', id: `kernel:${item.id}`, pillar: kernelPillar(item), origin: 'kernel', label: item.label,
      state: item.available ? words.available : words.missing, family: item.available ? 'proof' : 'idle',
      detail: item.path ?? null, source: `${kernelRead} · evidence[${item.id}]`,
    });
  }
  const latest = [...(sessions.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  for (const gate of latest?.gates ?? []) {
    evidence.push(gateEvidence(gate));
  }
  if (c) {
    const dimensions: readonly (readonly [string, string])[] = [
      ['scope', c.scope_status], ['requirements', c.requirements_status], ['architecture', c.architecture_status], ['quality', c.quality_status],
    ];
    for (const [name, value] of dimensions) {
      evidence.push({
        kind: 'evidence', id: `chief:${name}`, pillar: 'chief', origin: 'chief', label: words.dimension(name),
        state: value, family: DIMENSION_FAMILY[value] ?? familyFor(value), detail: null,
        source: `GET /api/companies/by-job/{job_id}/chief · ${name}_status`,
      });
    }
  }

  const verdict: ProofVerdict = k
    ? { kind: 'verdict', phase: k.kernel_phase, state: k.state, family: familyFor(k.kernel_phase), reason: k.reason }
    : { kind: 'verdict', phase: 'unknown', state: null, family: 'unknown', reason: null };
  const release: ProofRelease = q
    ? { kind: 'release', state: q.can_release ? 'CAN_RELEASE' : 'BLOCKED', family: q.can_release ? 'proof' : 'caution' }
    : { kind: 'release', state: 'unknown', family: 'unknown' };

  return { pillars, evidence, verdict, release };
}

function gateEvidence(gate: GateEvidence): ProofEvidence {
  const pillar: PillarId = /build/i.test(gate.gate) ? 'build' : 'tests';
  return {
    kind: 'evidence', id: `gate:${gate.gate}`, pillar, origin: 'gate', label: gate.label,
    state: gate.status, family: GATE_FAMILY[gate.status] ?? familyFor(gate.status), detail: gate.reason || null,
    source: `GET /api/test-room/{project_id}/sessions · gates[${gate.gate}]`,
  };
}

/* ---------------------------------------------------------------- layout */

const EV_W = 232;
const EV_H = 42;
const EV_GAP = 10;
const PILLAR_X = 330;
const PILLAR_W = 214;
const PILLAR_H = 70;
const VERDICT_X = 626;
const VERDICT_W = 244;
const VERDICT_H = 96;
const RELEASE_X = 942;
const GROUP_GAP = 22;

export function evidenceEdgeClass(family: Family): string {
  if (family === 'proof') return 'e-proof';
  if (family === 'fault') return 'e-blocked';
  if (family === 'caution') return 'e-caution';
  if (family === 'hand') return 'e-hand';
  return 'e-declared';
}

/** Each pillar folds its evidence until a person opens it; evidence that belongs to no pillar is always drawn. */
export function layoutProofGraph({ pillars, evidence, verdict, release, expanded, labels }: {
  readonly pillars: readonly ProofPillar[];
  readonly evidence: readonly ProofEvidence[];
  readonly verdict: ProofVerdict;
  readonly release: ProofRelease;
  readonly expanded: ReadonlySet<PillarId>;
  readonly labels: {
    readonly evidence: (item: ProofEvidence) => string;
    readonly pillar: (item: ProofPillar) => string;
    readonly toggle: (item: ProofPillar, open: boolean) => string;
    readonly verdict: string;
    readonly release: string;
  };
}): { readonly nodes: readonly GraphNode<ProofNodeData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<ProofNodeData>[] = [];
  const edges: GraphEdge[] = [];
  let cursor = 0;

  const groups: readonly (readonly [PillarId | null, readonly ProofEvidence[]])[] = [
    ...PILLARS.map((id) => [id, expanded.has(id) ? evidence.filter((item) => item.pillar === id) : []] as const),
    [null, evidence.filter((item) => item.pillar === null)] as const,
  ];
  const drawnEvidence = groups.some(([, items]) => items.length > 0);

  for (const [pillarId, items] of groups) {
    const height = Math.max(PILLAR_H, items.length * (EV_H + EV_GAP) - EV_GAP);
    items.forEach((item, i) => {
      nodes.push({
        id: item.id, x: 0, y: cursor + (height - (items.length * (EV_H + EV_GAP) - EV_GAP)) / 2 + i * (EV_H + EV_GAP),
        w: EV_W, h: EV_H, label: labels.evidence(item), data: item,
      });
    });
    if (pillarId) {
      const pillar = pillars.find((entry) => entry.id === pillarId)!;
      const owned = evidence.some((item) => item.pillar === pillarId);
      nodes.push({
        id: `pillar:${pillarId}`, x: PILLAR_X, y: cursor + (height - PILLAR_H) / 2, w: PILLAR_W, h: PILLAR_H, label: labels.pillar(pillar), data: pillar,
        toggle: owned ? { expanded: expanded.has(pillarId), label: labels.toggle(pillar, expanded.has(pillarId)), at: 'left' } : undefined,
      });
      items.forEach((item) => edges.push({ from: item.id, to: `pillar:${pillarId}`, orient: 'h', className: evidenceEdgeClass(item.family) }));
      edges.push({ from: `pillar:${pillarId}`, to: 'verdict', orient: 'h', className: evidenceEdgeClass(pillar.family) });
    } else {
      items.forEach((item) => edges.push({ from: item.id, to: 'verdict', orient: 'h', className: evidenceEdgeClass(item.family) }));
    }
    if (pillarId || items.length > 0) cursor += height + GROUP_GAP;
  }

  const total = Math.max(cursor - GROUP_GAP, VERDICT_H);
  nodes.push({ id: 'verdict', x: VERDICT_X, y: (total - VERDICT_H) / 2, w: VERDICT_W, h: VERDICT_H, label: labels.verdict, data: verdict });
  nodes.push({ id: 'release', x: RELEASE_X, y: (total - 64) / 2, w: 184, h: 64, label: labels.release, data: release });
  edges.push({ from: 'verdict', to: 'release', orient: 'h', className: evidenceEdgeClass(release.family) });

  if (drawnEvidence) nodes.push({ id: 'col:evidence', x: 0, y: -44, w: EV_W, h: 22, data: { kind: 'column', column: 'evidence' } });
  nodes.push({ id: 'col:pillar', x: PILLAR_X, y: -44, w: PILLAR_W, h: 22, data: { kind: 'column', column: 'pillar' } });
  nodes.push({ id: 'col:verdict', x: VERDICT_X, y: -44, w: RELEASE_X + 184 - VERDICT_X, h: 22, data: { kind: 'column', column: 'verdict' } });

  return { nodes, edges };
}
