'use client';

import { Archive, Download, RefreshCw } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/use-locale';
import type { MarketplaceItem } from '@/lib/api/marketplace';

interface Props {
  readonly items: readonly MarketplaceItem[] | null;
  readonly archivingId: string | null;
  readonly onArchive: (itemId: string) => void;
  readonly republishTargetId: string | null;
  readonly onStartRepublish: (itemId: string) => void;
  readonly republishNote: string;
  readonly onRepublishNoteChange: (value: string) => void;
  readonly republishBusy: boolean;
  readonly onRepublishSubmit: (itemId: string) => void;
}

const STATUS_TONE: Record<MarketplaceItem['status'], 'success' | 'neutral' | 'warning'> = {
  published: 'success', archived: 'neutral', draft: 'warning',
};

export function MyItemsDashboard({
  items, archivingId, onArchive, republishTargetId, onStartRepublish,
  republishNote, onRepublishNoteChange, republishBusy, onRepublishSubmit,
}: Props) {
  const { t } = useLocale();

  return (
    <Card className="space-y-3 p-6">
      <h2 className="text-lg font-semibold text-[color:var(--text)]">{t('marketplace.myItems.title')}</h2>
      {!items || items.length === 0 ? (
        <p className="text-sm text-[color:var(--muted)]">{t('marketplace.myItems.empty')}</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-[var(--radius-md)] border border-[color:var(--border)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[color:var(--text)]">
                    {item.name} <span className="font-normal text-[color:var(--muted)]">v{item.version}</span>
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <Badge tone={STATUS_TONE[item.status]}>{t(`marketplace.myItems.status.${item.status}`)}</Badge>
                    <Badge tone="neutral"><Download className="mr-1 h-3 w-3" aria-hidden />{item.downloads}</Badge>
                    <Badge tone="neutral" className="opacity-60" title={t('marketplace.myItems.revenueComingSoon')}>
                      {t('marketplace.myItems.comingSoon')}
                    </Badge>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.status !== 'archived' ? (
                    <Button type="button" variant="ghost" onClick={() => onStartRepublish(item.id)}>
                      <RefreshCw className="h-4 w-4" aria-hidden />{t('marketplace.myItems.republish')}
                    </Button>
                  ) : null}
                  {item.status !== 'archived' ? (
                    <Button type="button" variant="ghost" loading={archivingId === item.id} onClick={() => onArchive(item.id)}>
                      <Archive className="h-4 w-4" aria-hidden />{t('marketplace.myItems.archive')}
                    </Button>
                  ) : null}
                </div>
              </div>
              {republishTargetId === item.id ? (
                <form
                  className="mt-3 flex flex-wrap gap-2"
                  onSubmit={(event) => { event.preventDefault(); onRepublishSubmit(item.id); }}
                >
                  <Input
                    required
                    value={republishNote}
                    onChange={(event) => onRepublishNoteChange(event.target.value)}
                    placeholder={t('marketplace.myItems.republishNotePlaceholder')}
                    className="flex-1"
                  />
                  <Button type="submit" variant="primary" loading={republishBusy}>{t('marketplace.myItems.republishSubmit')}</Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
