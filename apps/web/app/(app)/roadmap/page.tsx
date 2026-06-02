'use client';

import { useEffect, useMemo } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { DeploymentPathSurface } from '@/components/visual/engineering-surface';
import { useRoadmap } from '@/hooks/use-roadmap';
import { getApiErrorMessage } from '@/lib/api/errors';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function formatLabel(value: string) {
  return value.replaceAll('_', ' ');
}

export default function RoadmapPage() {
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
      page_title: 'Roadmap Center',
      current_phase: 'Roadmap governance',
      pipeline: {
        route: '/roadmap',
        phase: 'Roadmap governance',
        status: roadmapQuery.isError ? 'degraded' : 'ready',
        readiness_label: roadmap ? `${roadmap.items.length} roadmap items` : 'Roadmap loading',
        detail: 'Roadmap groups modules, engines, registries, visualizations, templates and skills.',
      },
      status: roadmapQuery.isError ? 'warning' : 'observing',
      summary: 'Roadmap is grouped by implemented, in progress, planned, future and archived states.',
      suggestions: [],
    });
  }, [roadmap, roadmapQuery.isError, setContext, setPresenceState]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="Roadmap"
        description="Governed platform roadmap grouped by lifecycle status across modules, engines, registries, visualizations, templates and skills."
      />

      {roadmapQuery.isLoading ? (
        <CardLoading />
      ) : roadmapQuery.isError ? (
        <PageError
          title="Roadmap unavailable"
          description={getApiErrorMessage(roadmapQuery.error, 'Unable to load roadmap center data.')}
          onRetry={() => void roadmapQuery.refetch()}
        />
      ) : roadmap ? (
        <>
          <DeploymentPathSurface
            title="Roadmap Lifecycle"
            steps={roadmap.statuses.map((status) => ({
              label: status,
              detail: `${grouped.get(status)?.length ?? 0} items`,
              tone: status === 'IMPLEMENTED' ? 'success' : status === 'FUTURE' ? 'muted' : status === 'ARCHIVED' ? 'warning' : 'accent',
            }))}
          />

          <div className="grid gap-5">
            {roadmap.statuses.map((status) => (
              <section key={status} className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="text-xl font-semibold text-[color:var(--text)]">{status}</h2>
                  <Badge>{grouped.get(status)?.length ?? 0} items</Badge>
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
