'use client';

import { MoreHorizontal, SlidersHorizontal } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';

export type FoundationStatus = 'ready' | 'planned' | 'blocked' | 'draft';

export function StatusBadge({ status }: { readonly status: FoundationStatus }) {
  const { t } = useLocale();
  return <Badge>{t(`status.${status}`)}</Badge>;
}

export function FilterBar({ children }: { readonly children?: ReactNode }) {
  const { t } = useLocale();

  return (
    <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm font-semibold text-[color:var(--text)]">
        <SlidersHorizontal className="h-4 w-4 text-[color:var(--accent)]" />
        {t('list.filterSurface')}
      </div>
      <div className="flex flex-wrap gap-2">{children ?? <Badge>{t('list.foundationOnly')}</Badge>}</div>
    </Card>
  );
}

export function ListRow({
  title,
  description,
  status,
}: {
  readonly title: string;
  readonly description: string;
  readonly status: FoundationStatus;
}) {
  const { t } = useLocale();

  return (
    <div className="micro-interaction flex items-center justify-between gap-4 rounded-[var(--radius-xl)] border border-[color:var(--border)] bg-white/5 p-4">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-[color:var(--text)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[color:var(--muted)]">{description}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <StatusBadge status={status} />
        <Button type="button" variant="ghost" className="h-9 w-9 rounded-full p-0" aria-label={t('list.openActions', { title })}>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
