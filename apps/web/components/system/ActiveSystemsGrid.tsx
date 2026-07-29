'use client';

import { useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';

import { SystemGroupAccordion } from '@/components/system/SystemGroupAccordion';
import { SystemSearchFilter } from '@/components/system/SystemSearchFilter';
import { Button } from '@/components/ui/button';
import { useLocale } from '@/hooks/use-locale';
import { useSystemHealth, type SystemHealthItem, type SystemHealthStatus } from '@/hooks/useSystemHealth';
import type { SystemCategory } from '@/lib/system/engine-icons';

interface ActiveSystemsGridProps {
  readonly sections: readonly {
    readonly category: SystemCategory;
    readonly title: string;
  }[];
}

interface SectionCopy {
  readonly countKey: string;
  readonly viewKey: string;
  readonly hideKey: string;
}

const SECTION_COPY: Record<SystemCategory, SectionCopy> = {
  modules: {
    countKey: 'systemStatus.group.modulesCount',
    viewKey: 'systemStatus.group.viewModules',
    hideKey: 'systemStatus.group.hideModules',
  },
  engines: {
    countKey: 'systemStatus.group.enginesCount',
    viewKey: 'systemStatus.group.viewEngines',
    hideKey: 'systemStatus.group.hideEngines',
  },
  templates: {
    countKey: 'systemStatus.group.templatesCount',
    viewKey: 'systemStatus.group.viewTemplates',
    hideKey: 'systemStatus.group.hideTemplates',
  },
  skills: {
    countKey: 'systemStatus.group.skillsCount',
    viewKey: 'systemStatus.group.viewSkills',
    hideKey: 'systemStatus.group.hideSkills',
  },
};

function filterItems(items: readonly SystemHealthItem[], query: string): readonly SystemHealthItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return items;
  return items.filter((item) => item.name.toLowerCase().includes(normalized) || item.category.includes(normalized));
}

export function ActiveSystemsGrid({ sections }: ActiveSystemsGridProps) {
  const { t } = useLocale();
  const health = useSystemHealth();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim();

  const statusLabels: Record<SystemHealthStatus, string> = {
    healthy: t('systemStatus.health.healthy'),
    degraded: t('systemStatus.health.degraded'),
    down: t('systemStatus.health.down'),
    unavailable: t('systemStatus.health.unavailable'),
  };

  const visibleSections = useMemo(() => {
    return sections
      .map((section) => ({
        ...section,
        items: filterItems(health.groupedItems[section.category], normalizedQuery),
        total: health.groupedItems[section.category].length,
      }))
      .filter((section) => !normalizedQuery || section.items.length > 0);
  }, [health.groupedItems, normalizedQuery, sections]);

  const totalMatches = visibleSections.reduce((total, section) => total + section.items.length, 0);

  return (
    <section className="space-y-4" data-testid="active-systems-section">
      <div className="sticky top-0 z-10 -mx-2 rounded-xl border border-transparent bg-[color:var(--background)]/92 px-2 py-3 backdrop-blur-md sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
              {t('systemStatus.activeSystems')}
            </p>
            <p className="mt-1 text-sm text-[color:var(--muted)]">
              {health.isError ? t('systemStatus.healthCheckUnavailable') : t('systemStatus.healthCheckDetail')}
            </p>
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <SystemSearchFilter
              label={t('systemStatus.search.label')}
              placeholder={t('systemStatus.search.placeholder')}
              value={query}
              onChange={setQuery}
            />
            <Button
              type="button"
              variant="soft"
              loading={health.isRefetching}
              onClick={() => void health.refetch()}
              className="w-full sm:w-auto"
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
              {t('systemStatus.checkAgain')}
            </Button>
          </div>
        </div>

        {normalizedQuery ? (
          <p className="mt-2 text-xs text-cyan-200">
            {t('systemStatus.search.results', { count: totalMatches })}
          </p>
        ) : null}
      </div>

      {visibleSections.length ? (
        <div className="grid gap-3">
          {visibleSections.map((section) => {
            const copy = SECTION_COPY[section.category];
            const summary = normalizedQuery
              ? t('systemStatus.group.matchCount', { count: section.items.length })
              : t(copy.countKey, { count: section.total });

            return (
              <SystemGroupAccordion
                key={section.category}
                title={section.title}
                summary={summary}
                actionLabel={t(copy.viewKey)}
                collapseLabel={t(copy.hideKey)}
                items={section.items}
                forceOpen={Boolean(normalizedQuery)}
                statusLabels={statusLabels}
                emptyLabel={t('systemStatus.search.empty')}
              />
            );
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-gray-800/50 bg-gray-900/50 p-4 text-sm text-[color:var(--muted)]">
          {t('systemStatus.search.empty')}
        </p>
      )}
    </section>
  );
}