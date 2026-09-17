/**
 * The geometry of every V2 drawing: nodes are rectangles in world units, edges are one cubic curve (or the mark's
 * elbow) between two of them. Pure functions, so a layout can be checked without a browser.
 */

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface GraphNode<T = unknown> extends Rect {
  readonly id: string;
  /** Edges attach to this sub-rectangle (relative to the node) instead of the whole box: the dial of a captioned station. */
  readonly anchor?: Rect;
  readonly className?: string;
  /** The accessible name. A node without one is decoration (a zone, a band) and is never focusable. */
  readonly label?: string;
  /** A second control drawn beside the node, never inside it: a button inside a button is not operable. */
  readonly toggle?: { readonly expanded: boolean; readonly label: string; readonly at?: 'corner' | 'left' };
  readonly data: T;
}

export interface GraphEdge {
  readonly from: string;
  readonly to: string;
  readonly className?: string;
  /** `elbow`: down, one rounded corner, then across (the gesture of the mark). `drop`: hangs a chain below a node. */
  readonly shape?: 'elbow' | 'drop';
  readonly orient?: 'h' | 'v' | 'auto';
  readonly label?: string;
  readonly arrow?: boolean;
}

export interface EdgeGeometry {
  readonly d: string;
  readonly end: { readonly x: number; readonly y: number; readonly angle: number };
  readonly mid: { readonly x: number; readonly y: number };
}

const f = (value: number) => value.toFixed(1);

export const edgeKey = (edge: Pick<GraphEdge, 'from' | 'to'>) => `${edge.from}>${edge.to}`;

function anchored(node: GraphNode): Rect {
  return node.anchor ? { x: node.x + node.anchor.x, y: node.y + node.anchor.y, w: node.anchor.w, h: node.anchor.h } : node;
}

export function bounds(nodes: readonly Rect[]): Rect {
  if (nodes.length === 0) return { x: 0, y: 0, w: 1, h: 1 };
  const x = Math.min(...nodes.map((n) => n.x));
  const y = Math.min(...nodes.map((n) => n.y));
  const right = Math.max(...nodes.map((n) => n.x + n.w));
  const bottom = Math.max(...nodes.map((n) => n.y + n.h));
  return { x, y, w: Math.max(1, right - x), h: Math.max(1, bottom - y) };
}

export function edgeGeometry(from: GraphNode, to: GraphNode, edge: GraphEdge): EdgeGeometry {
  const a = anchored(from);
  const b = anchored(to);
  const acx = a.x + a.w / 2;
  const acy = a.y + a.h / 2;
  const bcx = b.x + b.w / 2;
  const bcy = b.y + b.h / 2;

  if (edge.shape === 'elbow') {
    const x1 = acx;
    const y1 = a.y + a.h + 6;
    const x2 = b.x - 6;
    const y2 = bcy;
    const r = Math.max(0, Math.min(28, Math.abs(y2 - y1) / 2, Math.abs(x2 - x1) / 2));
    return {
      d: `M${f(x1)} ${f(y1)} L${f(x1)} ${f(y2 - r)} Q${f(x1)} ${f(y2)} ${f(x1 + r)} ${f(y2)} L${f(x2)} ${f(y2)}`,
      end: { x: x2, y: y2, angle: 0 },
      mid: { x: (x1 + x2) / 2, y: y2 },
    };
  }

  if (edge.shape === 'drop') {
    const x1 = acx;
    const y1 = a.y + a.h + 6;
    const x2 = bcx;
    const y2 = b.y - 6;
    const d = Math.max(20, (y2 - y1) * 0.55);
    return {
      d: `M${f(x1)} ${f(y1)} C${f(x1)} ${f(y1 + d)} ${f(x2)} ${f(y2 - d)} ${f(x2)} ${f(y2)}`,
      end: { x: x2, y: y2, angle: Math.PI / 2 },
      mid: { x: (x1 + x2) / 2, y: (y1 + y2) / 2 },
    };
  }

  const orient = edge.orient ?? 'auto';
  const horizontal = orient === 'h' || (orient === 'auto' && Math.abs(bcx - acx) > Math.abs(bcy - acy));
  let x1: number; let y1: number; let x2: number; let y2: number;
  let c1x: number; let c1y: number; let c2x: number; let c2y: number;
  if (horizontal) {
    const dir = bcx >= acx ? 1 : -1;
    x1 = dir > 0 ? a.x + a.w + 6 : a.x - 6; y1 = acy;
    x2 = dir > 0 ? b.x - 6 : b.x + b.w + 6; y2 = bcy;
    const d = Math.max(28, Math.abs(x2 - x1) * 0.45);
    c1x = x1 + d * dir; c1y = y1; c2x = x2 - d * dir; c2y = y2;
  } else {
    const dir = bcy >= acy ? 1 : -1;
    x1 = acx; y1 = dir > 0 ? a.y + a.h + 6 : a.y - 6;
    x2 = bcx; y2 = dir > 0 ? b.y - 6 : b.y + b.h + 6;
    const d = Math.max(24, Math.abs(y2 - y1) * 0.5);
    c1x = x1; c1y = y1 + d * dir; c2x = x2; c2y = y2 - d * dir;
  }
  return {
    d: `M${f(x1)} ${f(y1)} C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x2)} ${f(y2)}`,
    end: { x: x2, y: y2, angle: Math.atan2(y2 - c2y, x2 - c2x) },
    mid: { x: (x1 + 3 * c1x + 3 * c2x + x2) / 8, y: (y1 + 3 * c1y + 3 * c2y + y2) / 8 },
  };
}

export function arrowPath(end: EdgeGeometry['end'], size = 5): string {
  const { x, y, angle } = end;
  const p1 = [x - size * Math.cos(angle - 0.5), y - size * Math.sin(angle - 0.5)];
  const p2 = [x - size * Math.cos(angle + 0.5), y - size * Math.sin(angle + 0.5)];
  return `M${f(p1[0]!)} ${f(p1[1]!)} L${f(x)} ${f(y)} L${f(p2[0]!)} ${f(p2[1]!)}`;
}

/** Everything upstream and downstream of one node: what it needed, and what needed it. */
export function traceSet(id: string, edges: readonly GraphEdge[]): { readonly nodes: ReadonlySet<string>; readonly edges: ReadonlySet<string> } {
  const nodes = new Set([id]);
  const lit = new Set<string>();
  const walk = (down: boolean) => {
    const queue = [id];
    const seen = new Set([id]);
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const edge of edges) {
        const [source, target] = down ? [edge.from, edge.to] : [edge.to, edge.from];
        if (source !== current) continue;
        lit.add(edgeKey(edge));
        nodes.add(target);
        if (!seen.has(target)) { seen.add(target); queue.push(target); }
      }
    }
  };
  walk(true);
  walk(false);
  return { nodes, edges: lit };
}

/** The lit edges of an explicit set: an edge is lit when both of its ends are. */
export function edgesWithin(ids: ReadonlySet<string>, edges: readonly GraphEdge[]): ReadonlySet<string> {
  return new Set(edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)).map(edgeKey));
}

export interface View {
  readonly x: number;
  readonly y: number;
  readonly k: number;
}

/** The camera that shows the whole drawing, centred above a reserved bottom band, never enlarged past `maxFit`. */
export function fitView(box: Rect, width: number, height: number, { padding, minScale, maxFit, bottom = 0 }: {
  readonly padding: number;
  readonly minScale: number;
  readonly maxFit: number;
  /** Height kept clear at the bottom for the legend and the controls. */
  readonly bottom?: number;
}): View {
  const aw = Math.max(1, width);
  const ah = Math.max(1, height - bottom);
  const k = Math.max(minScale, Math.min(maxFit, (aw - padding * 2) / box.w, (ah - padding * 2) / box.h));
  return { k, x: (aw - box.w * k) / 2 - box.x * k, y: (ah - box.h * k) / 2 - box.y * k };
}

/** The height a canvas needs to show its drawing at `maxFit`, kept between the bounds a screen allows. */
export function fitHeight(box: Rect, { padding, maxFit, bottom, min, max }: {
  readonly padding: number;
  readonly maxFit: number;
  readonly bottom: number;
  readonly min: number;
  readonly max: number;
}): number {
  return Math.round(Math.max(min, Math.min(max, box.h * maxFit + padding * 2 + bottom)));
}
