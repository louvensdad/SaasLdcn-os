'use client';

import { useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { DeploymentPathSurface, OperationalRail, ReadinessRing } from '@/components/visual/engineering-surface';
import { useSystemStatus } from '@/hooks/use-system-status';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { SystemStatusResponse } from '@/lib/api/types';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function statusTone(status: string) {
  if (status === 'blocked') return 'danger';
  if (status === 'warning') return 'warning';
  return 'success';
}

type StatusSignal = SystemStatusResponse['backend_status'];

export default function SystemStatusPage() {
  const statusQuery = useSystemStatus();
  const status = statusQuery.data;
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    setPresenceState(statusQuery.isError ? 'warning' : 'observing');
    setContext({
      route: '/system-status',
      page_title: 'System Status Center',
      current_phase: 'Runtime health',
      pipeline: {
        route: '/system-status',
        phase: 'Runtime health',
        status: statusQuery.isError ? 'degraded' : 'ready',
        readiness_label: status ? `${status.active_modules.length} modules observed` : 'Status loading',
        detail: 'Internal observability center for LDCN OS.',
      },
      status: statusQuery.isError ? 'warning' : 'observing',
      summary: 'Runtime health, validation, build and registry status are visible without external integrations.',
      suggestions: [],
    });
  }, [setContext, setPresenceState, status, statusQuery.isError]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title="System Status"
        description="Operational panel for the LDCN OS runtime, validation state, build health and internal registries."
      />

      {statusQuery.isLoading ? (
        <CardLoading />
      ) : statusQuery.isError ? (
        <PageError
          title="System status unavailable"
          description={getApiErrorMessage(statusQuery.error, 'Unable to load system status.')}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : status ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            {([
              ['Runtime Health', status.backend_status],
              ['Validation Status', status.api_status],
              ['Build Health', status.build_status],
              ['Registry Health', status.registry_health[0]],
            ] as [string, StatusSignal][]).map(([title, signal]) => (
              <Card key={String(title)} className="space-y-3 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{String(title)}</p>
                <h2 className="text-xl font-semibold text-[color:var(--text)]">{signal.label}</h2>
                <Badge>{signal.status}</Badge>
                <p className="text-sm leading-6 text-[color:var(--muted)]">{signal.detail}</p>
              </Card>
            ))}
          </div>

          <div className="grid gap-5 xl:grid-cols-[0.75fr_1.25fr]">
            <ReadinessRing
              title="Platform health"
              value={status.registry_health.every((signal) => signal.status === 'healthy') ? 96 : 68}
              label="Governed"
              caption="Health is derived from local runtime and registry signals."
              tone="success"
            />

            <OperationalRail
              title="Registry Health"
              items={status.registry_health.map((signal) => ({
                label: signal.label,
                value: signal.status,
                detail: signal.detail,
                tone: statusTone(signal.status) as 'success' | 'warning' | 'danger',
              }))}
            />
          </div>

          <DeploymentPathSurface
            title="Validation Status"
            steps={[
              { label: 'Last validation', detail: status.last_validation, tone: 'success' },
              { label: 'Test coverage', detail: status.test_coverage, tone: 'accent' },
              { label: 'Frontend status', detail: status.frontend_status.detail, tone: 'accent2' },
              { label: 'API status', detail: status.api_status.detail, tone: 'success' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-4">
            {[
              ['Active modules', status.active_modules],
              ['Active engines', status.active_engines],
              ['Active templates', status.active_templates],
              ['Active skills', status.active_skills],
            ].map(([title, values]) => (
              <Card key={String(title)} className="space-y-3 p-5">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">{String(title)}</p>
                <div className="flex flex-wrap gap-2">
                  {(values as readonly string[]).map((item) => <Badge key={item}>{item}</Badge>)}
                </div>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
