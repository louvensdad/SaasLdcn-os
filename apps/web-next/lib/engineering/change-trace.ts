import type { ChangeRequest, ChangeRequestStatus, FileDiff } from '@contracts/change-request.contract';

import type { GraphEdge, GraphNode } from '@/components/canvas/geometry';
import type { Family } from '@/components/signal';
import { familyFor } from '@/lib/status';

/**
 * A change request drawn as its own trace: intent → scope → files → build → preview → result. A line is solid when both
 * of its ends were observed by the backend and dashed while the step is only planned — a diff that was never applied is
 * not drawn as shipped code.
 */
export const LIFECYCLE: readonly ChangeRequestStatus[] = ['Draft', 'Analyzed', 'Planned', 'Approved', 'Applying', 'Validating', 'Accepted'];
const TERMINAL: readonly ChangeRequestStatus[] = ['Rejected', 'Rolled Back'];

export interface LifecycleStation {
  readonly id: string;
  readonly state: string;
  readonly family: Family;
  readonly current: boolean;
}

/** The lifecycle as stations: reached, current, not reached. A rejected or rolled-back change ends on its own terminal. */
export function lifecycle(status: ChangeRequestStatus, reached: string): readonly LifecycleStation[] {
  const terminal = TERMINAL.includes(status);
  const stages = terminal ? [...LIFECYCLE.slice(0, -1), status] : LIFECYCLE;
  const index = terminal ? stages.length - 1 : stages.indexOf(status);
  return stages.map((stage, i) => {
    if (i < index) return { id: stage, state: reached, family: 'proof' as Family, current: false };
    if (i === index) {
      /* The backend accepts a person's action at Draft, Analyzed, Planned and Approved; Applying and Validating run on their own. */
      const family: Family = stage === 'Rejected' || stage === 'Rolled Back' ? 'stop'
        : stage === 'Accepted' ? 'proof'
          : stage === 'Applying' || stage === 'Validating' ? 'pulse'
            : 'hand';
      return { id: stage, state: stage, family, current: true };
    }
    return { id: stage, state: 'NOT_RUN', family: 'idle' as Family, current: false };
  });
}

export type TraceColumn = 'intent' | 'scope' | 'files' | 'build' | 'preview' | 'result';
export const TRACE_COLUMNS: readonly TraceColumn[] = ['intent', 'scope', 'files', 'build', 'preview', 'result'];

export interface TraceItem {
  readonly kind: 'item';
  readonly column: TraceColumn;
  readonly title: string;
  readonly state: string;
  readonly family: Family;
  readonly observed: boolean;
  readonly detail: string | null;
}

export interface TraceHead {
  readonly kind: 'head';
  readonly column: TraceColumn;
}

export type TraceNodeData = TraceItem | TraceHead;

const APPLIED: readonly ChangeRequestStatus[] = ['Applying', 'Validating', 'Accepted', 'Rolled Back'];
const X: Readonly<Record<TraceColumn, number>> = { intent: 0, scope: 250, files: 530, build: 810, preview: 1010, result: 1210 };
const WIDTH: Readonly<Record<TraceColumn, number>> = { intent: 200, scope: 230, files: 230, build: 170, preview: 170, result: 150 };
const H = 56;
const GAP = 14;

export interface TraceWords {
  readonly inScope: string;
  readonly notApplied: string;
  readonly build: string;
  readonly preview: string;
  readonly result: string;
}

export function layoutChangeTrace(change: ChangeRequest, files: readonly FileDiff[], words: TraceWords): { readonly nodes: readonly GraphNode<TraceNodeData>[]; readonly edges: readonly GraphEdge[] } {
  const nodes: GraphNode<TraceNodeData>[] = [];
  const edges: GraphEdge[] = [];
  const analyzed = change.status !== 'Draft';
  const applied = APPLIED.includes(change.status);
  const line = (a: boolean, b: boolean, family: Family = 'proof') => (a && b ? (family === 'fault' ? 'e-blocked' : 'e-proof') : 'e-declared');

  const column = (key: TraceColumn, items: readonly Omit<TraceItem, 'kind' | 'column'>[]) => {
    const height = Math.max(1, items.length) * (H + GAP) - GAP;
    return items.map((item, i) => {
      const id = `${key}:${i}`;
      nodes.push({ id, x: X[key], y: i * (H + GAP) - height / 2, w: WIDTH[key], h: H, label: `${item.title}: ${item.state}`, data: { kind: 'item', column: key, ...item } });
      return { id, item };
    });
  };

  const [intent] = column('intent', [{ title: change.intent, state: change.status, family: familyFor(change.status), observed: true, detail: null }]);

  const scopeItems = change.scope.length > 0 ? change.scope : change.impact?.affected_files ?? [];
  const scope = column('scope', scopeItems.map((path) => ({
    title: path, state: analyzed ? words.inScope : 'NOT_RUN', family: (analyzed ? 'proof' : 'idle') as Family, observed: analyzed, detail: null,
  })));
  scope.forEach(({ id, item }) => edges.push({ from: intent!.id, to: id, orient: 'h', className: line(true, item.observed) }));

  const fileNodes = column('files', files.map((file) => ({
    title: file.path, state: applied ? file.change_kind : `${file.change_kind} · ${words.notApplied}`,
    family: (change.status === 'Accepted' ? 'proof' : applied ? 'pulse' : 'na') as Family, observed: applied, detail: null,
  })));
  fileNodes.forEach(({ id, item }, i) => {
    const owner = scope.find((entry) => entry.item.title === files[i]!.path);
    edges.push({ from: owner ? owner.id : intent!.id, to: id, orient: 'h', className: line(owner ? owner.item.observed : true, item.observed) });
  });

  const build = change.build_result;
  const [buildNode] = column('build', [{
    title: words.build, state: build ? `installed: ${build.installed} · built: ${build.built}` : 'NOT_RUN',
    family: build ? (build.ok ? 'proof' : 'fault') : 'idle', observed: Boolean(build), detail: build?.skipped_reason ?? null,
  }]);
  (fileNodes.length > 0 ? fileNodes : [intent!]).forEach((source) => edges.push({
    from: source.id, to: buildNode!.id, orient: 'h', className: line(source.item.observed, Boolean(build), build && !build.ok ? 'fault' : 'proof'),
  }));

  const preview = change.preview_result;
  const previewOk = preview ? preview.supported && preview.crash_count === 0 && preview.routes.every((route) => route.ok) : false;
  const [previewNode] = column('preview', [{
    title: words.preview,
    state: preview ? (preview.supported ? `routes ok: ${preview.routes.filter((route) => route.ok).length}/${preview.routes.length} · crash_count: ${preview.crash_count}` : 'supported: false') : 'NOT_RUN',
    family: preview ? (preview.supported ? (previewOk ? 'proof' : 'fault') : 'na') : 'idle', observed: Boolean(preview), detail: preview?.reason ?? null,
  }]);
  edges.push({ from: buildNode!.id, to: previewNode!.id, orient: 'h', className: line(Boolean(build), Boolean(preview), previewOk ? 'proof' : 'fault') });

  const result = change.result;
  const [resultNode] = column('result', [{
    title: words.result, state: result ? result.outcome : 'NOT_RUN',
    family: result ? (result.outcome === 'accepted' ? 'proof' : 'stop') : 'idle', observed: Boolean(result), detail: result?.reason ?? null,
  }]);
  edges.push({ from: previewNode!.id, to: resultNode!.id, orient: 'h', className: line(Boolean(preview), Boolean(result)) });

  const top = Math.min(...nodes.map((node) => node.y));
  TRACE_COLUMNS.forEach((key) => nodes.push({ id: `head:${key}`, x: X[key], y: top - 44, w: WIDTH[key], h: 22, data: { kind: 'head', column: key } }));
  return { nodes, edges };
}
