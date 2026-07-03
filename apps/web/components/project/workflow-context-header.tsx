'use client';

import Link from 'next/link';
import { Check, Circle, Cpu, GitBranch, ShieldCheck } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { useActiveLlm } from '@/hooks/use-active-llm';
import { cn } from '@/lib/cn';
import type { ProjectRoom } from '@contracts/project-room.contract';

const STAGES = [
  ['Project Room', 'DRAFT', '/project-rooms'],
  ['PromptMaster', 'PROMPT_READY', '/project-rooms'],
  ['Architect AI', 'BLUEPRINT_READY', '/architect'],
  ['Engineering Review', 'ENGINEERING_REVIEW', '/engineering-review'],
  ['Approval', 'ENGINEERING_APPROVED', '/engineering-review'],
  ['Meta Factory', 'WAITING_META_FACTORY', '/meta-factory'],
  ['Generation', 'GENERATING', '/meta-factory'],
  ['Validation', 'VALIDATING', '/meta-factory'],
  ['Ready', 'READY', '/projects'],
] as const;

const STATUS_RANK: Record<string, number> = {
  DRAFT: 0, UNDER_REVIEW: 0, PROMPT_READY: 1, PROMPT_APPROVED: 2,
  BLUEPRINT_GENERATING: 2, BLUEPRINT_READY: 2, ENGINEERING_REVIEW: 3,
  ENGINEERING_APPROVED: 4, WAITING_META_FACTORY: 5, META_FACTORY_RUNNING: 5,
  GENERATING: 6, VALIDATING: 7, READY: 8,
};

export function WorkflowContextHeader({ room, stage }: { readonly room: ProjectRoom; readonly stage: string }) {
  const llm = useActiveLlm();
  const activeRank = STATUS_RANK[room.status] ?? 0;
  const version = room.active_blueprint_version ?? room.blueprint_versions?.at(-1)?.version ?? (room.architecture_blueprint ? 1 : 0);
  const provider = room.architecture_blueprint?.degraded
    ? 'Modo Offline'
    : room.architecture_blueprint?.providerLabel || llm.providerLabel || 'Não configurado';
  const score = room.engineering_review?.score?.overall ?? Math.round((room.architecture_blueprint?.confidence ?? room.confidence) * 100);

  return (
    <section className="workflow-context overflow-hidden rounded-[var(--radius-xl)] border border-[color-mix(in_srgb,var(--accent)_24%,var(--border))] bg-[color:var(--surface-2)] shadow-[var(--shadow-soft)]" aria-label="Workflow do projeto">
      <div className="grid divide-y divide-[color:var(--border)] md:grid-cols-3 md:divide-x md:divide-y-0 xl:grid-cols-6">
        <Metric label="Projeto" value={room.title} />
        <Metric label="Provider ativo" value={provider} icon={<Cpu className="h-3.5 w-3.5" />} />
        <Metric label="Blueprint" value={version ? `v${version}` : 'Pendente'} icon={<GitBranch className="h-3.5 w-3.5" />} />
        <Metric label="Status atual" value={stage} accent />
        <Metric label="Readiness" value={`${score}%`} icon={<ShieldCheck className="h-3.5 w-3.5" />} />
        <Metric label="Workspace" value={room.workspace_id || 'Enterprise'} />
      </div>
      <nav className="overflow-x-auto border-t border-[color:var(--border)] px-4 py-3" aria-label="Pipeline de engenharia">
        <ol className="flex min-w-max items-center">
          {STAGES.map(([label, , href], index) => {
            const done = index < activeRank;
            const active = index === activeRank;
            const target = `${href}?projectId=${room.room_id}`;
            return (
              <li key={label} className="flex items-center">
                <Link href={target} className={cn('focus-ring flex items-center gap-2 rounded-md px-2 py-1 text-xs font-medium', active ? 'text-[color:var(--accent)]' : done ? 'text-[color:var(--text)]' : 'text-[color:var(--muted-2)]')} aria-current={active ? 'step' : undefined}>
                  <span className={cn('grid h-5 w-5 place-items-center rounded-full border', done ? 'border-[color:var(--success)] bg-[color-mix(in_srgb,var(--success)_15%,transparent)] text-[color:var(--success)]' : active ? 'border-[color:var(--accent)] bg-[color-mix(in_srgb,var(--accent)_15%,transparent)]' : 'border-[color:var(--border)]')}>
                    {done ? <Check className="h-3 w-3" /> : <Circle className="h-2 w-2 fill-current" />}
                  </span>
                  {label}
                </Link>
                {index < STAGES.length - 1 ? <span className={cn('mx-1 h-px w-5', index < activeRank ? 'bg-[color:var(--success)]' : 'bg-[color:var(--border)]')} /> : null}
              </li>
            );
          })}
        </ol>
      </nav>
    </section>
  );
}

function Metric({ label, value, icon, accent }: { readonly label: string; readonly value: string; readonly icon?: React.ReactNode; readonly accent?: boolean }) {
  return (
    <div className="min-w-0 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted-2)]">{label}</p>
      <div className="mt-1 flex items-center gap-1.5">
        {icon ? <span className="text-[color:var(--muted)]">{icon}</span> : null}
        {accent ? <Badge tone="accent">{value}</Badge> : <p className="truncate text-sm font-semibold text-[color:var(--text)]" title={value}>{value}</p>}
      </div>
    </div>
  );
}
