'use client';

import { useState } from 'react';
import { ChevronDown, Download, ShieldCheck, Tag } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useLocale } from '@/hooks/use-locale';
import type { MarketplaceItem } from '@/lib/api/marketplace';
import { categoryLabel } from '@/components/marketplace/category-label';

function humanizeTag(permission: string): string {
  const [, value] = permission.split(':');
  if (!value) return permission;
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface Props {
  readonly item: MarketplaceItem;
  readonly installed: boolean;
  readonly installing: boolean;
  readonly isOwnItem: boolean;
  readonly onInstall: () => void;
}

export function MarketplaceItemCard({ item, installed, installing, isOwnItem, onInstall }: Props) {
  const { t, locale } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const updatedAt = new Date(item.updated_at).toLocaleDateString(locale);

  return (
    <Card className="flex h-full flex-col gap-4 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="ds-caption text-[color:var(--muted)]">
            {t('marketplace.version')} {item.version} · {isOwnItem ? t('marketplace.card.byYou') : `${t('marketplace.by')} ${item.author_user_id.slice(0, 8)}`}
          </p>
          <h3 className="mt-1 truncate text-xl font-semibold text-[color:var(--text)]">{item.name}</h3>
        </div>
        <Badge tone="accent">{categoryLabel(t, item.category)}</Badge>
      </div>

      <div>
        <p className={expanded ? 'text-sm leading-6 text-[color:var(--muted)]' : 'line-clamp-2 text-sm leading-6 text-[color:var(--muted)]'}>
          {item.description}
        </p>
        {item.description.length > 96 ? (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="focus-ring mt-1 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--accent)]"
          >
            <ChevronDown className={expanded ? 'h-3 w-3 rotate-180 transition-transform' : 'h-3 w-3 transition-transform'} aria-hidden />
            {expanded ? t('marketplace.card.showLess') : t('marketplace.card.showMore')}
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge><Tag className="mr-1 h-3 w-3" aria-hidden />{item.license}</Badge>
        {item.permissions.map((permission) => (
          <Badge key={permission} tone="neutral"><ShieldCheck className="mr-1 h-3 w-3" aria-hidden />{humanizeTag(permission)}</Badge>
        ))}
      </div>

      <div className="mt-auto flex items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-3 text-xs text-[color:var(--muted)]">
          <span className="inline-flex items-center gap-1"><Download className="h-3.5 w-3.5" aria-hidden />{item.downloads}</span>
          <span>{t('marketplace.card.updatedAt', { date: updatedAt })}</span>
        </div>
        <Button
          type="button"
          variant="primary"
          loading={installing}
          disabled={installed}
          onClick={onInstall}
        >
          <Download className="h-4 w-4" aria-hidden />
          {installed ? t('marketplace.installed') : t('marketplace.install')}
        </Button>
      </div>
    </Card>
  );
}
