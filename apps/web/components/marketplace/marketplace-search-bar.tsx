'use client';

import { Search } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useLocale } from '@/hooks/use-locale';
import { categoryLabel } from '@/components/marketplace/category-label';

export type MarketplaceSort = 'recent' | 'downloads' | 'name';

interface Props {
  readonly search: string;
  readonly onSearchChange: (value: string) => void;
  readonly categories: readonly string[];
  readonly category: string | null;
  readonly onCategoryChange: (category: string | null) => void;
  readonly sort: MarketplaceSort;
  readonly onSortChange: (sort: MarketplaceSort) => void;
}

export function MarketplaceSearchBar({ search, onSearchChange, categories, category, onCategoryChange, sort, onSortChange }: Props) {
  const { t } = useLocale();

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--muted)]" aria-hidden />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-9"
            placeholder={t('marketplace.searchPlaceholder')}
            aria-label={t('marketplace.search')}
          />
        </label>
        <label className="flex items-center gap-2 text-xs font-medium text-[color:var(--muted)]">
          {t('marketplace.filters.sortLabel')}
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as MarketplaceSort)}
            className="focus-ring h-11 rounded-[var(--radius-md)] border border-[color:var(--border)] bg-[color-mix(in_srgb,var(--surface-3)_45%,transparent)] px-3 text-sm text-[color:var(--text)]"
          >
            <option value="recent">{t('marketplace.filters.sort.recent')}</option>
            <option value="downloads">{t('marketplace.filters.sort.downloads')}</option>
            <option value="name">{t('marketplace.filters.sort.name')}</option>
          </select>
        </label>
      </div>

      {categories.length > 0 ? (
        <div role="tablist" aria-label={t('marketplace.filters.categoryLabel')} className="flex flex-wrap gap-2">
          <button type="button" role="tab" aria-selected={category === null} onClick={() => onCategoryChange(null)} className="focus-ring rounded-full">
            <Badge tone={category === null ? 'accent' : 'neutral'}>{t('marketplace.filters.categoryAll')}</Badge>
          </button>
          {categories.map((value) => (
            <button key={value} type="button" role="tab" aria-selected={category === value} onClick={() => onCategoryChange(value)} className="focus-ring rounded-full">
              <Badge tone={category === value ? 'accent' : 'neutral'}>{categoryLabel(t, value)}</Badge>
            </button>
          ))}
        </div>
      ) : null}
    </Card>
  );
}
