'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { WorkbenchTrace } from '@/components/drawings/workbench-trace';
import { Icon } from '@/components/signal';
import { Badge, Kv, Failure, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { useProject } from '@/lib/project/use-project';

export function EngineeringScreen({ projectKey }: { readonly projectKey: string }) {
  const { t } = useI18n();
  const project = useProject(projectKey);
  const { generatedProjectId, latest } = project;
  const base = `/p/${encodeURIComponent(projectKey)}/engineering`;
  const [command, setCommand] = useState('ls');

  const overview = useQuery({
    queryKey: ['lab-overview', generatedProjectId],
    queryFn: () => api.labOverview(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const run = useMutation({ mutationFn: () => api.runCommand(String(generatedProjectId), command.trim()) });
  /* The trace of the latest mission: its plan, its units of work, what ran them, what they wrote and what proves it. */
  const missionId = latest?.id ?? null;
  const plan = useQuery({ queryKey: ['company-plan', missionId], queryFn: () => api.companyPlan(String(missionId)), enabled: Boolean(missionId), retry: false });
  const companyJobs = useQuery({ queryKey: ['company-jobs', missionId], queryFn: () => api.companyJobs(String(missionId)), enabled: Boolean(missionId), retry: false });
  const executions = useQuery({ queryKey: ['company-executions', missionId], queryFn: () => api.companyExecutions(String(missionId)), enabled: Boolean(missionId), retry: false });
  const mission = useQuery({ queryKey: ['job', missionId], queryFn: () => api.job(String(missionId)), enabled: Boolean(missionId), retry: false });
  const sessions = useQuery({
    queryKey: ['test-sessions', generatedProjectId],
    queryFn: () => api.testSessions(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const latestSession = [...(sessions.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null;

  if (!generatedProjectId) {
    return (
      <PageState title={t('nav.engineering')} kind="empty" stateTitle={t('engineering.none')} illustration="project">
        {t('engineering.noneBody')}
      </PageState>
    );
  }

  const data = overview.data;

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.engineering')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            {data ? <Badge value={data.stack} family="proof" /> : null}
          </div>
          <h1 className="title">{t('engineering.title')}</h1>
          <p className="lede">{t('engineering.lede')}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-ghost" href={`${base}/changes`}>{t('engineering.changes')}</Link>
          <Link className="btn btn-ghost" href={`${base}/verification`}>{t('engineering.verification')}</Link>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('workbench.label')}</h2>
          <span className="meta">{t('workbench.note')}</span>
        </div>
        {!missionId ? <StateBlock kind="empty" title={t('workbench.noMission')} /> : null}
        {missionId && plan.isPending ? <Skeleton lines={4} /> : null}
        {missionId && plan.isError ? <StateBlock kind="error" title={t('workbench.unreadable')} /> : null}
        {missionId && plan.isSuccess && !plan.data ? <StateBlock kind="empty" title={t('workbench.noPlan')}>{t('workbench.noPlanBody')}</StateBlock> : null}
        {plan.data ? (
          <WorkbenchTrace
            plan={plan.data}
            jobs={companyJobs.data ?? []}
            executions={executions.data ?? []}
            job={mission.data ?? null}
            session={latestSession}
          />
        ) : null}
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/plan · /jobs · /executions · GET /api/meta-factory/jobs/{'{'}job_id{'}'} · artifacts · GET /api/test-room/{'{'}project_id{'}'}/sessions</Source>
      </section>

      {overview.isPending ? <Skeleton lines={5} /> : null}
      {overview.isError ? <StateBlock kind="error" title={t('engineering.unreadable')} /> : null}

      {data ? (
        <>
          <div className="facts">
            <div className="fact"><span className="label">{t('engineering.files')}</span><div className="v num">{data.file_count}</div></div>
            <div className="fact"><span className="label">{t('engineering.lines')}</span><div className="v num">{data.line_count}</div></div>
            <div className="fact"><span className="label">{t('engineering.dependencies')}</span><div className="v num">{data.dependency_count}</div></div>
            <div className="fact"><span className="label">{t('engineering.build')}</span><div className="v">{data.build}</div></div>
            <div className="fact"><span className="label">{t('engineering.coverage')}</span><div className="v">{data.coverage}</div></div>
          </div>

          <div className="grid g-2" style={{ marginTop: 20 }}>
            <section className="sec">
              <div className="sec-head"><h2 className="h-sec">{t('engineering.workspace.title')}</h2></div>
              <Kv
                pairs={[
                  [t('engineering.path'), <span key="p" className="mono">{data.project_path}</span>],
                  [t('engineering.language'), <span key="l" className="mono">{data.primary_language}</span>],
                  [t('engineering.languages'), <span key="ls" className="chips">{Object.entries(data.languages).map(([language, count]) => (
                    <span className="chip mono" key={language}>{language} · {count}</span>
                  ))}</span>],
                  [t('engineering.containers'), data.containers.length > 0 ? data.containers.join(', ') : '—'],
                  [t('engineering.databases'), data.databases.length > 0 ? data.databases.join(', ') : '—'],
                ]}
              />
              <Source>GET /api/engineering-lab/projects/{'{'}project_id{'}'}/overview</Source>
            </section>

            <section className="sec">
              <div className="sec-head">
                <h2 className="h-sec">{t('engineering.deps.title')}</h2>
                <span className="meta">{t('engineering.deps.meta', { count: data.dependencies.length })}</span>
              </div>
              <div className="chips">
                {data.dependencies.slice(0, 24).map((dependency) => (
                  <span className="chip mono" key={`${dependency.name}-${dependency.version ?? ''}`}>
                    {dependency.name}{dependency.version ? ` ${dependency.version}` : ''}
                  </span>
                ))}
                {data.dependencies.length > 24 ? <span className="meta">+{data.dependencies.length - 24}</span> : null}
              </div>
            </section>
          </div>
        </>
      ) : null}

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('engineering.terminal.title')}</h2>
          <span className="meta">{t('engineering.terminal.meta')}</span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="field" style={{ flex: 1, minWidth: 240 }}>
            <span className="sr-only">{t('engineering.terminal.command')}</span>
            <input value={command} onChange={(event) => setCommand(event.target.value)} placeholder={t('engineering.terminal.command')} />
          </label>
          <button className="btn btn-primary" type="button" disabled={run.isPending || !command.trim()} onClick={() => run.mutate()}>
            <Icon name="terminal" /> {run.isPending ? t('engineering.terminal.running') : t('engineering.terminal.run')}
          </button>
        </div>
        {run.isError ? <Failure title={t('engineering.terminal.failed')} error={run.error} onRetry={() => run.mutate()} /> : null}
        {run.data ? (
          <section className="console" style={{ marginTop: 12 }} aria-label={t('engineering.terminal.title')}>
            <div className="console-head">
              <span className="mono">{run.data.command}</span>
              <Badge value={`exit ${run.data.exit_code}`} family={run.data.exit_code === 0 ? 'proof' : 'fault'} />
              <span className="meta">{run.data.duration_ms} ms · {run.data.cwd}</span>
              {run.data.allowed_command ? null : <Badge value="NOT_ALLOWED" family="caution" human={t('engineering.terminal.notAllowed')} />}
            </div>
            <div className="console-body">
              {run.data.output.map((chunk, index) => (
                <div className="ev" key={index}>
                  <span className="ev-time">{chunk.kind}</span>
                  <span />
                  <span className="ev-type" />
                  <span className="ev-msg" style={{ whiteSpace: 'pre-wrap' }}>{chunk.text}</span>
                </div>
              ))}
            </div>
          </section>
        ) : null}
        <p className="meta" style={{ marginTop: 10 }}>{t('engineering.terminal.note')}</p>
        <Source>POST /api/engineering-lab/projects/{'{'}project_id{'}'}/terminal</Source>
      </section>
    </>
  );
}
