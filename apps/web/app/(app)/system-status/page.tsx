'use client';

import { useEffect } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { DeploymentPathSurface, OperationalRail, ReadinessRing } from '@/components/visual/engineering-surface';
import { useSystemStatus } from '@/hooks/use-system-status';
import { useLocale } from '@/hooks/use-locale';
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
  const { t } = useLocale();
  const statusQuery = useSystemStatus();
  const status = statusQuery.data;
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  useEffect(() => {
    setPresenceState(statusQuery.isError ? 'warning' : 'observing');
    setContext({
      route: '/system-status',
      page_title: t('systemStatus.context.pageTitle'),
      current_phase: t('systemStatus.context.phase'),
      pipeline: {
        route: '/system-status',
        phase: t('systemStatus.context.phase'),
        status: statusQuery.isError ? 'degraded' : 'ready',
        readiness_label: status ? t('systemStatus.context.moduleCount', { count: status.active_modules.length }) : t('systemStatus.context.loading'),
        detail: t('systemStatus.context.detail'),
      },
      status: statusQuery.isError ? 'warning' : 'observing',
      summary: t('systemStatus.context.summary'),
      suggestions: [],
    });
  }, [setContext, setPresenceState, status, statusQuery.isError, t]);

  return (
    <div className="space-y-8">
      <SectionHeader
        title={t('systemStatus.title')}
        description={t('systemStatus.description')}
      />

      {statusQuery.isLoading ? (
        <CardLoading />
      ) : statusQuery.isError ? (
        <PageError
          title={t('systemStatus.error.title')}
          description={getApiErrorMessage(statusQuery.error, t('systemStatus.error.description'))}
          onRetry={() => void statusQuery.refetch()}
        />
      ) : status ? (
        <>
          <div className="grid gap-4 lg:grid-cols-4">
            {([
              [t('systemStatus.runtimeHealth'), status.backend_status],
              [t('systemStatus.validationStatus'), status.api_status],
              [t('systemStatus.buildHealth'), status.build_status],
              [t('systemStatus.registryHealth'), status.registry_health[0]],
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
              title={t('systemStatus.platformHealth')}
              value={status.registry_health.every((signal) => signal.status === 'healthy') ? 96 : 68}
              label={t('systemStatus.governed')}
              caption={t('systemStatus.platformHealthDetail')}
              tone="success"
            />

            <OperationalRail
              title={t('systemStatus.registryHealth')}
              items={status.registry_health.map((signal) => ({
                label: signal.label,
                value: signal.status,
                detail: signal.detail,
                tone: statusTone(signal.status) as 'success' | 'warning' | 'danger',
              }))}
            />
          </div>

          <DeploymentPathSurface
            title={t('systemStatus.validationStatus')}
            steps={[
              { label: t('systemStatus.lastValidation'), detail: status.last_validation, tone: 'success' },
              { label: t('systemStatus.testCoverage'), detail: status.test_coverage, tone: 'accent' },
              { label: t('systemStatus.frontendStatus'), detail: status.frontend_status.detail, tone: 'accent2' },
              { label: t('systemStatus.apiStatus'), detail: status.api_status.detail, tone: 'success' },
            ]}
          />

          <div className="grid gap-4 lg:grid-cols-4">
            {[
              [t('systemStatus.activeModules'), status.active_modules],
              [t('systemStatus.activeEngines'), status.active_engines],
              [t('systemStatus.activeTemplates'), status.active_templates],
              [t('systemStatus.activeSkills'), status.active_skills],
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
