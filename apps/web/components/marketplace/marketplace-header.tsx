'use client';

import { CardLoading } from '@/components/feedback/loading-system';
import { MetricCard } from '@/components/shell/metric-card';
import { SectionHeader } from '@/components/shell/section-header';
import { useLocale } from '@/hooks/use-locale';
import type { MarketplaceItem } from '@/lib/api/marketplace';

interface Props {
  readonly catalog: readonly MarketplaceItem[] | null;
}

/** All 4 metrics are computed client-side from the already-fetched catalog
 * array -- no new fetch, no fabricated numbers. */
export function MarketplaceHeader({ catalog }: Props) {
  const { t } = useLocale();

  return (
    <div className="space-y-5">
      <SectionHeader title={t('marketplace.title')} description={t('marketplace.description')} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {catalog === null ? (
          <>
            <CardLoading className="min-h-40" />
            <CardLoading className="min-h-40" />
            <CardLoading className="min-h-40" />
            <CardLoading className="min-h-40" />
          </>
        ) : (
          <>
            <MetricCard
              label={t('marketplace.metrics.available')}
              value={String(catalog.length)}
              detail={t('marketplace.metrics.availableDetail')}
            />
            <MetricCard
              label={t('marketplace.metrics.categories')}
              value={String(new Set(catalog.map((item) => item.category)).size)}
              detail={t('marketplace.metrics.categoriesDetail')}
            />
            <MetricCard
              label={t('marketplace.metrics.downloads')}
              value={String(catalog.reduce((sum, item) => sum + item.downloads, 0))}
              detail={t('marketplace.metrics.downloadsDetail')}
            />
            <MetricCard
              label={t('marketplace.metrics.developers')}
              value={String(new Set(catalog.map((item) => item.author_user_id)).size)}
              detail={t('marketplace.metrics.developersDetail')}
            />
          </>
        )}
      </div>
    </div>
  );
}
