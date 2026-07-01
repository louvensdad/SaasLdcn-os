'use client';

import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

export interface ArchitectureGraphNode {
  readonly id: string;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly status: string;
  readonly detail: string;
}

// Fixed layout (percent coordinates) + structural edges. Edges are only drawn
// between nodes that exist; an edge reads as "active" when BOTH endpoints were
// detected in the real inventory, otherwise it is dimmed. Nothing is invented —
// node presence comes entirely from file evidence passed in by the caller.
const POSITIONS: Record<string, { x: number; y: number }> = {
  frontend: { x: 50, y: 12 },
  container: { x: 16, y: 30 },
  auth: { x: 84, y: 30 },
  backend: { x: 50, y: 46 },
  database: { x: 20, y: 84 },
  cache: { x: 40, y: 86 },
  queue: { x: 62, y: 86 },
  storage: { x: 84, y: 80 },
};

const EDGES: ReadonlyArray<readonly [string, string]> = [
  ['frontend', 'backend'],
  ['container', 'backend'],
  ['backend', 'auth'],
  ['backend', 'database'],
  ['backend', 'cache'],
  ['backend', 'queue'],
  ['backend', 'storage'],
];

export function ArchitectureGraph({
  nodes,
  selectedId,
  onSelect,
}: {
  readonly nodes: readonly ArchitectureGraphNode[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const detected = (id: string) => (byId.get(id)?.status ?? '').toLowerCase().startsWith('detect');

  return (
    <div className="relative w-full overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_30%,transparent)]">
      <div className="relative aspect-[16/11] w-full">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
          {EDGES.map(([a, b]) => {
            const pa = POSITIONS[a];
            const pb = POSITIONS[b];
            if (!pa || !pb || !byId.has(a) || !byId.has(b)) return null;
            const active = detected(a) && detected(b);
            return (
              <line
                key={`${a}-${b}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={active ? 'color-mix(in srgb, var(--accent) 55%, transparent)' : 'color-mix(in srgb, var(--border) 70%, transparent)'}
                strokeWidth={active ? 0.6 : 0.4}
                strokeDasharray={active ? undefined : '1.5 1.5'}
                vectorEffect="non-scaling-stroke"
                className={active ? 'graph-edge' : undefined}
              />
            );
          })}
        </svg>

        {nodes.map((node, index) => {
          const pos = POSITIONS[node.id] ?? { x: 50, y: 50 };
          const isDetected = detected(node.id);
          const isSelected = node.id === selectedId;
          const Icon = node.icon;
          return (
            <button
              key={node.id}
              type="button"
              onClick={() => onSelect(node.id)}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, animationDelay: `${index * 60}ms` }}
              className={cn(
                'graph-node focus-ring absolute -translate-x-1/2 -translate-y-1/2 rounded-[var(--radius-md)] border px-2.5 py-2 text-center transition',
                isSelected
                  ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]'
                  : isDetected
                    ? 'border-[color:var(--border-strong)] bg-[color-mix(in_srgb,var(--surface-2)_88%,transparent)] hover:border-[color:var(--accent)]'
                    : 'border-dashed border-[color:var(--border)] bg-white/[0.03] opacity-70 hover:opacity-100',
              )}
            >
              <span className="flex flex-col items-center gap-1">
                <Icon className={cn('h-4 w-4', isDetected ? 'text-[color:var(--accent)]' : 'text-[color:var(--muted-2)]')} aria-hidden />
                <span className="text-[11px] font-medium leading-none text-[color:var(--text)]">{node.label}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
