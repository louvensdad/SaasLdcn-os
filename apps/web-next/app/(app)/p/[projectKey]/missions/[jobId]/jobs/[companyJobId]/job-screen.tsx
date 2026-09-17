'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { JobGraph } from '@/components/drawings/job-graph';
import { Signal } from '@/components/signal';
import { Badge, Kv, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { jobFamily } from '@/lib/company/job-graph';
import { familyFor } from '@/lib/status';

export function CompanyJobScreen({ projectKey, jobId, companyJobId }: {
  readonly projectKey: string;
  readonly jobId: string;
  readonly companyJobId: string;
}) {
  const { t } = useI18n();
  const base = `/p/${encodeURIComponent(projectKey)}/missions/${encodeURIComponent(jobId)}`;
  const jobs = useQuery({ queryKey: ['company-jobs', jobId], queryFn: () => api.companyJobs(jobId), retry: false });
  const executions = useQuery({ queryKey: ['company-executions', jobId], queryFn: () => api.companyExecutions(jobId), retry: false });
  const plan = useQuery({ queryKey: ['company-plan', jobId], queryFn: () => api.companyPlan(jobId), retry: false });

  if (jobs.isPending) return <Skeleton lines={5} />;
  const job = (jobs.data ?? []).find((entry) => entry.id === companyJobId);
  if (!job) {
    return (
      <PageState title={t('company.title')} kind="unknown" stateTitle={t('companyJob.none')} action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={`${base}/company`}>{t('company.title')}</Link></div>}>
        {t('companyJob.noneBody', { id: companyJobId })}
      </PageState>
    );
  }

  const mine = (executions.data ?? []).filter((execution) => execution.blueprint_ref === job.blueprint_ref);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('companyJob.eyebrow')}</span>
            <span className="chip mono">{job.blueprint_ref}</span>
            <Badge value={job.status} family={jobFamily(job)} />
          </div>
          <h1 className="title">{job.title}</h1>
          <p className="lede">{job.detail || t('companyJob.noDetail')}</p>
        </div>
        <div className="btn-row"><Link className="btn btn-ghost" href={`${base}/company`}>{t('agent.backToCompany')}</Link></div>
      </div>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('companyJob.what.title')}</h2></div>
          <Kv
            pairs={[
              [t('companyJob.type'), <span key="t" className="mono">{job.type}</span>],
              [t('companyJob.team'), <span key="m" className="mono">{job.team_id ?? '—'}</span>],
              [t('companyJob.depth'), <span key="d" className="num">{job.depth}</span>],
              [t('companyJob.refusal'), job.refusal_code
                ? <Badge key="r" value={job.refusal_code} family="fault" />
                : <span key="r" className="meta">{t('companyJob.noRefusal')}</span>],
            ]}
          />
          <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/jobs</Source>
        </section>

        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('companyJob.needs.title')}</h2></div>
          <div className="stack">
            <div>
              <span className="label">{t('companyJob.competencies')}</span>
              <div className="chips" style={{ marginTop: 6 }}>
                {job.required_competencies.length === 0
                  ? <span className="meta">—</span>
                  : job.required_competencies.map((item) => <span className="chip mono" key={item}>{item}</span>)}
              </div>
            </div>
            <div>
              <span className="label">{t('companyJob.gates')}</span>
              <div className="chips" style={{ marginTop: 6 }}>
                {job.required_gates.length === 0
                  ? <span className="meta">—</span>
                  : job.required_gates.map((item) => <span className="chip mono" key={item}>{item}</span>)}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('jobmap.neighbourhood')}</h2>
          <span className="meta">{t('jobmap.neighbourhoodNote')}</span>
        </div>
        <JobGraph base={base} jobs={jobs.data ?? []} plan={plan.data ?? null} executions={executions.data ?? []} focus={job.id} />
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/jobs · dependency_job_ids</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('companyJob.executions.title')}</h2>
          <span className="meta">{t('company.executions.meta', { count: mine.length })}</span>
        </div>
        {mine.length === 0 ? (
          <StateBlock kind="empty" title={t('companyJob.executions.none')}>{t('companyJob.executions.noneBody')}</StateBlock>
        ) : (
          <div className="list">
            {mine.map((execution) => (
              <div className="li" key={execution.id}>
                <Signal family={familyFor(execution.status)} label={execution.role} />
                <span className="li-title">{execution.role}</span>
                <span className="meta num">{execution.input_tokens} / {execution.output_tokens}</span>
                <span className="li-sub">
                  <span className="mono">{execution.stage} · {execution.status}</span>
                  {execution.model ? ` · ${execution.model}` : ''}
                  {execution.served_by_fallback ? ` · ${t('company.executions.fallback')}` : ''}
                </span>
              </div>
            ))}
          </div>
        )}
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/executions · blueprint_ref</Source>
      </section>
    </>
  );
}
