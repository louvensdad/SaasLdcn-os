'use client';

import type { HTMLAttributes } from 'react';

import type { LdcnContext } from '@contracts/ldcn.contract';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import { cn } from '@/lib/cn';

import { LDCNStatusPill } from './ldcn-status-pill';

interface LDCNContextPanelProps extends HTMLAttributes<HTMLDivElement> {
  readonly context: LdcnContext;
  readonly compact?: boolean;
}

function KeyValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-[var(--radius-xl)] border border-white/10 bg-white/[0.04] p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{label}</p>
      <p className="mt-2 text-sm font-semibold text-[color:var(--text)]">{value}</p>
    </div>
  );
}

export function LDCNContextPanel({ className, context, compact = false, ...props }: LDCNContextPanelProps) {
  const { t } = useLocale();

  return (
    <Card
      className={cn('relative overflow-hidden p-4', compact ? 'p-4' : 'p-5', className)}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_srgb,var(--accent)_10%,transparent),transparent_30%)]" />
      <div className="relative space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--muted)]">{t('ldcn.context.title')}</p>
            <p className="mt-2 text-lg font-semibold text-[color:var(--text)]">{context.page_title}</p>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">{context.summary}</p>
          </div>
          <LDCNStatusPill state={context.status} />
        </div>

        <div className={cn('grid gap-3', compact ? 'sm:grid-cols-2' : 'md:grid-cols-2')}>
          <KeyValue label={t('ldcn.context.route')} value={context.route} />
          <KeyValue label={t('ldcn.context.phase')} value={context.current_phase} />
          <KeyValue label={t('ldcn.context.pipeline')} value={context.pipeline.readiness_label} />
          <KeyValue label={t('ldcn.context.status')} value={context.pipeline.status} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge>{context.pipeline.route}</Badge>
          <Badge>{context.pipeline.phase}</Badge>
          {context.locale ? <Badge>{context.locale}</Badge> : null}
          {context.project_id ? <Badge>{context.project_id}</Badge> : null}
        </div>

        {context.suggestions.length ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[color:var(--muted)]">{t('ldcn.context.suggestions')}</p>
            <div className="grid gap-2">
              {context.suggestions.slice(0, compact ? 2 : 3).map((suggestion) => (
                <div key={suggestion.id} className="rounded-[var(--radius-xl)] border border-white/10 bg-black/10 px-3 py-2">
                  <p className="text-sm font-semibold text-[color:var(--text)]">{suggestion.label}</p>
                  <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{suggestion.summary}</p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
