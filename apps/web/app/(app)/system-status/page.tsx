'use client';

import { useEffect, useMemo, useState } from 'react';
import { Activity, Blocks, CheckCircle2, Database, Server, ShieldCheck } from 'lucide-react';

import { Card } from '@/components/ui/card';
import { PageError } from '@/components/feedback/error-system';
import { CardLoading } from '@/components/feedback/loading-system';
import { SectionHeader } from '@/components/shell/section-header';
import { ActiveSystemsGrid } from '@/components/system/ActiveSystemsGrid';
import { DeployModeToggle } from '@/components/system/DeployModeToggle';
import { StatusSummaryCard, type SummaryTone } from '@/components/system/StatusSummaryCard';
import { DeploymentPathSurface, ReadinessRing } from '@/components/visual/engineering-surface';
import { useSystemStatus } from '@/hooks/use-system-status';
import { useLocale } from '@/hooks/use-locale';
import { getApiErrorMessage } from '@/lib/api/errors';
import type { SystemStatusResponse } from '@/lib/api/types';
import { useLDCNStore } from '@/stores/use-ldcn-store';

function statusTone(status: string): SummaryTone {
  if (status === 'blocked') return 'danger';
  if (status === 'warning') return 'warning';
  return 'success';
}

type StatusSignal = SystemStatusResponse['backend_status'];

function activeSystemSections(t: (key: string) => string) {
  return [
    { category: 'modules' as const, title: t('systemStatus.activeModules') },
    { category: 'engines' as const, title: t('systemStatus.activeEngines') },
    { category: 'templates' as const, title: t('systemStatus.activeTemplates') },
    { category: 'skills' as const, title: t('systemStatus.activeSkills') },
  ];
}

function registrySignal(status: SystemStatusResponse): StatusSignal {
  return status.registry_health.find((signal) => signal.id === 'engines') ?? status.registry_health[0] ?? status.api_status;
}

function platformScore(status: SystemStatusResponse): number {
  const signals = [status.backend_status, status.api_status, status.build_status, status.frontend_status, ...status.registry_health];
  if (signals.some((signal) => signal.status === 'blocked')) return 42;
  if (signals.some((signal) => signal.status === 'warning')) return 72;
  return 96;
}

function deploymentBlockers(status: SystemStatusResponse): readonly string[] {
  const signals = [status.backend_status, status.api_status, status.build_status, status.frontend_status, ...status.registry_health];
  return signals
    .filter((signal) => signal.status === 'blocked')
    .map((signal) => `${signal.label}: ${signal.detail}`);
}

function statusCards(status: SystemStatusResponse, t: (key: string) => string) {
  const registry = registrySignal(status);
  return [
    {
      label: t('systemStatus.summary.runtime'),
      value: status.backend_status.status,
      detail: status.backend_status.detail,
      tone: statusTone(status.backend_status.status),
      icon: Server,
    },
    {
      label: t('systemStatus.summary.api'),
      value: status.api_status.status,
      detail: status.api_status.detail,
      tone: statusTone(status.api_status.status),
      icon: Activity,
    },
    {
      label: t('systemStatus.summary.build'),
      value: status.build_status.status,
      detail: status.build_status.detail,
      tone: statusTone(status.build_status.status),
      icon: CheckCircle2,
    },
    {
      label: t('systemStatus.summary.registry'),
      value: registry.status,
      detail: registry.detail,
      tone: statusTone(registry.status),
      icon: ShieldCheck,
    },
  ];
}

export default function SystemStatusPage() {
  const { t } = useLocale();
  const statusQuery = useSystemStatus();
  const status = statusQuery.data;
  const [deployMode, setDeployMode] = useState(false);
  const setPresenceState = useLDCNStore((state) => state.setPresenceState);
  const setContext = useLDCNStore((state) => state.setContext);

  const score = useMemo(() => (status ? platformScore(status) : 0), [status]);
  const blockers = useMemo(() => (status ? deploymentBlockers(status) : []), [status]);

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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <SectionHeader
          title={t('systemStatus.title')}
          description={t('systemStatus.description')}
        />
        <DeployModeToggle
          enabled={deployMode}
          onChange={setDeployMode}
          label={t('systemStatus.deployMode')}
        />
      </div>

      {statusQuery.isLoading ? (
        <CardLoading />
      ) : statusQuery.isError ? (
        <div className="space-y-6">
          <PageError
            title={t('systemStatus.error.title')}
            description={getApiErrorMessage(statusQuery.error, t('systemStatus.error.description'))}
            onRetry={() => void statusQuery.refetch()}
          />
          {!deployMode ? <ActiveSystemsGrid sections={activeSystemSections(t)} /> : null}
        </div>
      ) : status ? (
        deployMode ? (
          <div className="space-y-4" data-testid="deploy-mode-panel">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              <StatusSummaryCard
                label={t('systemStatus.summary.runtime')}
                value={status.backend_status.status}
                detail={status.backend_status.detail}
                tone={statusTone(status.backend_status.status)}
                icon={Server}
              />
              <StatusSummaryCard
                label={t('systemStatus.summary.api')}
                value={status.api_status.status}
                detail={status.api_status.detail}
                tone={statusTone(status.api_status.status)}
                icon={Activity}
              />
              <StatusSummaryCard
                label={t('systemStatus.summary.build')}
                value={status.build_status.status}
                detail={status.build_status.detail}
                tone={statusTone(status.build_status.status)}
                icon={CheckCircle2}
              />
              <StatusSummaryCard
                label={t('systemStatus.summary.db')}
                value={t('systemStatus.deploy.dbReady')}
                detail={t('systemStatus.deploy.dbDetail')}
                tone="neutral"
                icon={Database}
              />
              <StatusSummaryCard
                label={t('systemStatus.summary.health')}
                value={`${score}%`}
                detail={score >= 90 ? t('systemStatus.deploy.ready') : t('systemStatus.deploy.review')}
                tone={score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger'}
                icon={ShieldCheck}
              />
              <StatusSummaryCard
                label={t('systemStatus.lastValidation')}
                value={status.last_validation}
                detail={status.test_coverage}
                tone="accent"
                icon={Blocks}
              />
            </div>

            <Card className="space-y-3 p-5" data-testid="deploy-blockers">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[color:var(--muted)]">
                  {t('systemStatus.deploy.blockers')}
                </p>
                <span className="rounded-full border border-gray-700 px-2 py-0.5 font-mono text-xs text-[color:var(--muted)]">
                  {blockers.length}
                </span>
              </div>
              {blockers.length ? (
                <ul className="grid gap-2 text-sm text-[color:var(--muted)]">
                  {blockers.map((blocker) => (
                    <li key={blocker} className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-100">
                      {blocker}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-[color:var(--muted)]">{t('systemStatus.deploy.noBlockers')}</p>
              )}
            </Card>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {statusCards(status, t).map((card) => (
                <StatusSummaryCard key={card.label} {...card} />
              ))}
            </div>

            <ReadinessRing
              title={t('systemStatus.platformHealth')}
              value={score}
              label={t('systemStatus.governed')}
              caption={t('systemStatus.platformHealthDetail')}
              tone={score >= 90 ? 'success' : score >= 70 ? 'warning' : 'danger'}
            />

            <DeploymentPathSurface
              title={t('systemStatus.validationStatus')}
              steps={[
                { label: t('systemStatus.lastValidation'), detail: status.last_validation, tone: 'success' },
                { label: t('systemStatus.testCoverage'), detail: status.test_coverage, tone: 'accent' },
                { label: t('systemStatus.frontendStatus'), detail: status.frontend_status.detail, tone: 'accent2' },
                { label: t('systemStatus.apiStatus'), detail: status.api_status.detail, tone: 'success' },
              ]}
            />

            <ActiveSystemsGrid sections={activeSystemSections(t)} />
          </>
        )
      ) : null}
    </div>
  );
}