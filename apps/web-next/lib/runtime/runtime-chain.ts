import type { ConsoleLogEntry, LivePreviewSession } from '@contracts/live-preview.contract';
import type { Evidence, GateEvidence, TestRoomSessionView } from '@contracts/test-room.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

/**
 * How the generated project was proven to run. The backend serves Test Room gates (build, start, health, tests…) with
 * the evidence each recorded, and one live preview with its console. It does not serve a list of services with ports,
 * latency history or restart counts (G6), so the drawing is the chain a session recorded — not an invented topology.
 */
export const GATE_FAMILY: Readonly<Record<string, Family>> = { observed: 'proof', failed: 'fault', not_executed: 'idle', unsupported: 'na' };

export interface ChainGate {
  readonly kind: 'gate';
  readonly gate: GateEvidence;
  readonly family: Family;
}

export interface ChainProbe {
  readonly kind: 'probe';
  readonly gate: string;
  readonly evidence: Evidence;
  readonly family: Family;
  /** What the probe measured, as recorded: HTTP status, exit code, duration, port. */
  readonly readings: readonly string[];
}

export interface ChainPreview {
  readonly kind: 'preview';
  readonly state: string;
  readonly family: Family;
  readonly session: LivePreviewSession | null;
}

export interface ChainConsole {
  readonly kind: 'console';
  readonly errors: number;
  readonly warnings: number;
  readonly total: number;
  readonly family: Family;
  readonly read: boolean;
}

export interface ChainLane {
  readonly kind: 'lane';
  readonly lane: 'session' | 'preview';
  readonly session: TestRoomSessionView | null;
}

export interface ChainGap {
  readonly kind: 'gap';
}

/** No Test Room session answered: never run (read) or not readable. */
export interface ChainEmpty {
  readonly kind: 'empty';
  readonly family: Family;
}

export type ChainNodeData = ChainGate | ChainProbe | ChainPreview | ChainConsole | ChainLane | ChainGap | ChainEmpty;

export function probeReadings(evidence: Evidence): readonly string[] {
  const out: string[] = [];
  if (evidence.http_status != null) out.push(`HTTP ${evidence.http_status}`);
  if (evidence.exit_code != null) out.push(`exit ${evidence.exit_code}`);
  if (evidence.duration_ms != null) out.push(`${Math.round(evidence.duration_ms)} ms`);
  const port = evidence.detail?.port;
  if (port != null) out.push(`:${port}`);
  return out;
}

const GATE_W = 214;
const GATE_H = 70;
const GATE_GAP = 44;
const PROBE_W = 204;
const PROBE_H = 50;

export function layoutRuntimeChain({ session, sessionRead, preview, previewRead, console: entries, consoleRead, labels }: {
  readonly session: TestRoomSessionView | null;
  /** False while the sessions read has not answered or failed. */
  readonly sessionRead: boolean;
  readonly preview: LivePreviewSession | null;
  readonly previewRead: boolean;
  readonly console: readonly ConsoleLogEntry[] | null;
  readonly consoleRead: boolean;
  readonly labels: {
    readonly gate: (gate: GateEvidence) => string;
    readonly probe: (evidence: Evidence) => string;
    readonly preview: (state: string) => string;
    readonly console: (errors: number) => string;
    readonly noSession: string;
  };
}): { readonly nodes: readonly GraphNode<ChainNodeData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<ChainNodeData>[] = [];
  const edges: GraphEdge[] = [];

  nodes.push({ id: 'lane:session', x: 0, y: -44, w: 4 * (GATE_W + GATE_GAP) - GATE_GAP, h: 22, data: { kind: 'lane', lane: 'session', session } });
  const gates = session?.gates ?? [];
  let deepest = GATE_H;
  if (gates.length === 0) {
    nodes.push({ id: 'session:none', x: 0, y: 0, w: GATE_W, h: GATE_H, label: labels.noSession, data: { kind: 'empty', family: sessionRead ? 'idle' : 'unknown' } });
  }
  gates.forEach((gate, i) => {
    const x = i * (GATE_W + GATE_GAP);
    const family = GATE_FAMILY[gate.status] ?? familyFor(gate.status);
    const id = `gate:${gate.gate}`;
    nodes.push({ id, x, y: 0, w: GATE_W, h: GATE_H, label: labels.gate(gate), data: { kind: 'gate', gate, family } });
    if (i > 0) {
      const previous = gates[i - 1]!;
      edges.push({ from: `gate:${previous.gate}`, to: id, orient: 'h', className: chainClass(GATE_FAMILY[previous.status] ?? 'unknown', family) });
    }
    gate.evidence.forEach((evidence, j) => {
      const probeFamily = GATE_FAMILY[evidence.status] ?? familyFor(evidence.status);
      const probeId = `probe:${gate.gate}:${evidence.id}:${j}`;
      const y = GATE_H + 40 + j * (PROBE_H + 12);
      deepest = Math.max(deepest, y + PROBE_H);
      nodes.push({
        id: probeId, x: x + (GATE_W - PROBE_W) / 2, y, w: PROBE_W, h: PROBE_H, label: labels.probe(evidence),
        data: { kind: 'probe', gate: gate.gate, evidence, family: probeFamily, readings: probeReadings(evidence) },
      });
      edges.push(j === 0
        ? { from: id, to: probeId, orient: 'v', arrow: false, className: chainClass(family, probeFamily) }
        : { from: `probe:${gate.gate}:${gate.evidence[j - 1]!.id}:${j - 1}`, to: probeId, orient: 'v', arrow: false, className: chainClass(probeFamily, probeFamily) });
    });
  });

  const laneY = deepest + 96;
  nodes.push({ id: 'lane:preview', x: 0, y: laneY - 44, w: 2 * (GATE_W + GATE_GAP) - GATE_GAP, h: 22, data: { kind: 'lane', lane: 'preview', session: null } });
  const previewState = preview ? preview.status : previewRead ? 'NOT_STARTED' : 'unknown';
  const previewFamily: Family = preview
    ? (preview.status === 'running' ? 'proof' : preview.status === 'starting' ? 'pulse' : preview.status === 'failed' ? 'fault' : preview.status === 'unsupported' ? 'na' : 'stop')
    : previewRead ? 'idle' : 'unknown';
  nodes.push({ id: 'preview', x: 0, y: laneY, w: GATE_W, h: GATE_H, label: labels.preview(previewState), data: { kind: 'preview', state: previewState, family: previewFamily, session: preview } });

  const errors = (entries ?? []).filter((entry) => entry.type === 'error').length;
  const warnings = (entries ?? []).filter((entry) => entry.type === 'warning').length;
  const consoleFamily: Family = !preview ? 'idle' : !consoleRead ? 'unknown' : errors > 0 ? 'fault' : warnings > 0 ? 'caution' : 'proof';
  nodes.push({
    id: 'console', x: GATE_W + GATE_GAP, y: laneY, w: GATE_W, h: GATE_H, label: labels.console(errors),
    data: { kind: 'console', errors, warnings, total: entries?.length ?? 0, family: consoleFamily, read: consoleRead },
  });
  edges.push({ from: 'preview', to: 'console', orient: 'h', className: chainClass(previewFamily, consoleFamily) });

  nodes.push({ id: 'gap:g6', x: 2 * (GATE_W + GATE_GAP), y: laneY, w: 2 * GATE_W + GATE_GAP, h: GATE_H, data: { kind: 'gap' } });

  return { nodes, edges };
}

function chainClass(from: Family, to: Family): string {
  if (to === 'fault') return 'e-blocked';
  if (to === 'pulse') return 'e-live';
  if (from === 'proof' && to === 'proof') return 'e-proof';
  if (to === 'idle' || to === 'na' || to === 'unknown') return 'e-declared';
  return '';
}
