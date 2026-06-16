'use client';

import { useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { DeploymentPathSurface } from '@/components/visual/engineering-surface';
import { useRoadmap } from '@/hooks/use-roadmap';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function RoadmapPage() {
  const { t } = useLocale();
  const roadmapQuery = useRoadmap();
  const roadmap = roadmapQuery.data;
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  const grouped = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof roadmap>['items']>();
    for (const status of roadmap?.statuses ?? []) groups.set(status, []);
    for (const item of roadmap?.items ?? []) {
      groups.set(item.status, [...(groups.get(item.status) ?? []), item]);
    }
    return groups;
  }, [roadmap]);

  useEffect(() => {
    setPresenceState(roadmapQuery.isError ? 'warning' : 'observing');
    setContext({
      route: '/roadmap',
      page_title: t('roadmap.context.pageTitle'),
      current_phase: t('roadmap.context.phase'),
      pipeline: {
        route: '/roadmap',
        phase: t('roadmap.context.phase'),
        status: roadmapQuery.isError ? 'degraded' : 'ready',
        readiness_label: roadmap ? t('roadmap.context.itemCount', { count: roadmap.items.length }) : t('roadmap.context.loading'),
        detail: t('roadmap.context.detail'),
      },
      status: roadmapQuery.isError ? 'warning' : 'observing',
      summary: t('roadmap.context.summary'),
      suggestions: [],
    });
  }, [roadmap, roadmapQuery.isError, setContext, setPresenceState, t]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('roadmap.title')}
        description={t('roadmap.description')}
      />

      {roadmapQuery.isLoading ? (
        <CardLoading />
      ) : roadmapQuery.isError ? (
        <PageError
          title={t('roadmap.error.title')}
          description={getApiErrorMessage(roadmapQuery.error, t('roadmap.error.description'))}
          onRetry={() => void roadmapQuery.refetch()}
        />
      ) : roadmap ? (
        <>
          <DeploymentPathSurface
            title={t('roadmap.lifecycle')}
            steps={roadmap.statuses.map((status) => ({
              label: t(`roadmap.status.${status}`),
              detail: t('roadmap.itemCount', { count: grouped.get(status)?.length ?? 0 }),
              tone: status === 'IMPLEMENTED' ? 'success' : status === 'FUTURE' ? 'muted' : status === 'ARCHIVED' ? 'warning' : 'accent',
            }))}
          />

          <div className="grid gap-5">
            {roadmap.statuses.map((status) => (
              <section key={status} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-[color:var(--text)]">{t(`roadmap.status.${status}`)}</h2>
                  <Badge>{t('roadmap.itemCount', { count: grouped.get(status)?.length ?? 0 })}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {(grouped.get(status) ?? []).map((item) => (
                    <Card key={item.id} className="space-y-3 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <h3 className="text-lg font-semibold text-[color:var(--text)]">{item.title}</h3>
                        <Badge>{formatLabel(item.category)}</Badge>
                      </div>
                      <p className="text-sm leading-6 text-[color:var(--muted)]">{item.summary}</p>
                      <Badge>{item.status}</Badge>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
