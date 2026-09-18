'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { JobGraph } from '@/components/drawings/job-graph';
import { OrgChart } from '@/components/drawings/org-chart';
import { Signal, type Family } from '@/components/signal';
import { Badge, Kv, PageState, Skeleton, Source } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

/** REFUSED is the platform saying nobody can do this work; BLOCKED is only "not yet". They never render the same. */
const JOB_FAMILY: Readonly<Record<string, Family>> = { READY: 'proof', BLOCKED: 'caution', REFUSED: 'fault' };
const EXPANSION_FAMILY: Readonly<Record<string, Family>> = { REQUESTED: 'hand', RESOLVED: 'proof', REFUSED: 'fault' };

export function CompanyScreen({ projectKey, jobId }: { readonly projectKey: string; readonly jobId: string }) {
  const { t, locale } = useI18n();
  const base = `/p/${encodeURIComponent(projectKey)}/missions/${encodeURIComponent(jobId)}`;

  const company = useQuery({ queryKey: ['company', jobId], queryFn: () => api.company(jobId), retry: false });
  const assignments = useQuery({ queryKey: ['company-assignments', jobId], queryFn: () => api.companyAssignments(jobId), retry: false });
  const jobs = useQuery({ queryKey: ['company-jobs', jobId], queryFn: () => api.companyJobs(jobId), retry: false });
  const executions = useQuery({ queryKey: ['company-executions', jobId], queryFn: () => api.companyExecutions(jobId), retry: false });
  const expansions = useQuery({ queryKey: ['company-expansions', jobId], queryFn: () => api.companyExpansions(jobId), retry: false });
  const cognitive = useQuery({ queryKey: ['cognitive-certifications'], queryFn: api.cognitiveCertifications, retry: false });
  const plan = useQuery({ queryKey: ['company-plan', jobId], queryFn: () => api.companyPlan(jobId), retry: false });

  if (company.isPending) return <Skeleton lines={8} />;
  if (!company.data) {
    return (
      <PageState title={t('company.title')} kind="empty" stateTitle={t('company.none')} illustration="agents" action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={base}>{t('nav.missions')}</Link></div>}>
        {t('company.noneBody')}
      </PageState>
    );
  }

  const data = company.data;
  const refusalFor = (role: string) => (assignments.data ?? []).find((entry) => entry.role === role && entry.refusal_code);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('company.eyebrow')}</span>
            <span className="chip mono">{data.company_id}</span>
            <Badge value={data.status} family={data.status === 'OPEN' ? 'pulse' : 'proof'} />
            <Badge value={data.certification_mode} family={data.certification_mode === 'ENFORCE' ? 'proof' : 'caution'} />
          </div>
          <h1 className="title">{t('company.title')}</h1>
          <p className="lede">{t('company.lede')}</p>
        </div>
        <div className="btn-row">
          <Link className="btn btn-ghost" href={base}>{t('company.backToMission')}</Link>
        </div>
      </div>

      <section className="sec">
        <Kv
          pairs={[
            [t('company.opened'), formatWhen(data.opened_at, locale)],
            [t('company.closed'), data.closed_at ? `${formatWhen(data.closed_at, locale)} · ${data.closed_reason ?? ''}` : t('company.stillOpen')],
            [t('company.capabilities'), <span key="c" className="chips">{data.capabilities.map((capability) => <span className="chip mono" key={capability}>{capability}</span>)}</span>],
          ]}
        />
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('org.label')}</h2>
          <span className="meta">{t('org.meta', { teams: data.teams.length, seats: data.teams.reduce((sum, team) => sum + team.positions.length, 0) })}</span>
        </div>
        <OrgChart
          base={base}
          company={data}
          assignments={assignments.data ?? []}
          jobs={jobs.data ?? []}
          executions={executions.data ?? []}
          runs={cognitive.data?.roles ?? []}
        />
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'} · GET /api/workforce/cognitive-certifications</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('company.teams.title')}</h2>
          <span className="meta">{t('company.teams.meta', { count: data.teams.length })}</span>
        </div>
        <div className="lanes">
          {data.teams.map((team) => (
            <section className="lane" key={team.team_id}>
              <div className="lane-head">
                <span className="lane-title">{team.label}</span>
                <span className="meta">{team.positions.length}</span>
              </div>
              <p className="meta" style={{ margin: '0 0 8px' }}>{team.mandate}</p>
              <div className="list">
                {team.positions.map((position) => {
                  const refusal = position.member ? null : refusalFor(position.definition_id);
                  return (
                    <div className="li" key={position.position_id}>
                      <Signal
                        family={position.member ? 'proof' : refusal ? 'fault' : 'idle'}
                        label={position.title}
                      />
                      <span className="li-title">
                        {position.member ? (
                          <Link href={`${base}/company/agents/${encodeURIComponent(position.member.instance_id)}`}>{position.title}</Link>
                        ) : position.title}
                      </span>
                      <span className="meta mono">#{position.seat_number}</span>
                      <span className="li-sub">
                        {position.member
                          ? <>{position.member.definition_id} · <span className="mono">{position.member.certification}</span></>
                          : refusal
                            ? <>{t('company.unstaffed')} · <span className="mono">{refusal.refusal_code}</span> {refusal.detail}</>
                            : t('company.notStaffedYet')}
                        {position.why ? ` · ${position.why}` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/assignments</Source>
      </section>

      {jobs.data && jobs.data.length > 0 ? (
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('jobmap.label')}</h2>
            <span className="meta">{plan.data ? t('jobmap.note') : t('jobmap.noPlanNote')}</span>
          </div>
          <JobGraph base={base} jobs={jobs.data} plan={plan.data ?? null} executions={executions.data ?? []} />
          <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/jobs · dependency_job_ids · GET …/plan · critical_path</Source>
        </section>
      ) : null}

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('company.jobs.title')}</h2>
            <span className="meta">{t('company.jobs.meta', { count: jobs.data?.length ?? 0 })}</span>
          </div>
          {jobs.isPending ? <Skeleton lines={3} /> : null}
          {jobs.data && jobs.data.length === 0 ? <p className="meta">{t('company.jobs.none')}</p> : null}
          <div className="list">
            {(jobs.data ?? []).map((job) => (
              <Link className="li li-link" key={job.id} href={`${base}/jobs/${encodeURIComponent(job.id)}`}>
                <Signal family={JOB_FAMILY[job.status] ?? 'unknown'} label={job.title} />
                <span className="li-title">{job.title}</span>
                <span className="meta mono">{job.status}</span>
                <span className="li-sub">
                  <span className="mono">{job.blueprint_ref}</span> · {t('company.jobs.depth', { depth: job.depth })}
                  {job.refusal_code ? ` · ${job.refusal_code}` : ''}
                  {job.detail ? ` · ${job.detail}` : ''}
                </span>
              </Link>
            ))}
          </div>
          <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/jobs</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('company.expansions.title')}</h2>
            <span className="meta">{t('company.expansions.meta', { count: expansions.data?.length ?? 0 })}</span>
          </div>
          {expansions.isPending ? <Skeleton lines={3} /> : null}
          {expansions.data && expansions.data.length === 0 ? <p className="meta">{t('company.expansions.none')}</p> : null}
          <div className="list">
            {(expansions.data ?? []).map((expansion) => (
              <div className="li" key={expansion.id}>
                <Signal family={EXPANSION_FAMILY[expansion.status] ?? 'unknown'} label={expansion.capability_key} />
                <span className="li-title mono">{expansion.capability_key}</span>
                <span className="meta mono">{expansion.status}</span>
                <span className="li-sub">
                  {expansion.reason}
                  {expansion.refusal_detail ? ` · ${expansion.refusal_detail}` : ''}
                  {expansion.resolved_seat ? ` · ${expansion.resolved_seat}` : ''}
                </span>
              </div>
            ))}
          </div>
          <p className="meta">{t('company.expansions.note')}</p>
          <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/expansions</Source>
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('company.executions.title')}</h2>
          <span className="meta">{t('company.executions.meta', { count: executions.data?.length ?? 0 })}</span>
        </div>
        {executions.isPending ? <Skeleton lines={3} /> : null}
        {executions.data && executions.data.length > 0 ? (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('company.executions.role')}</th>
                  <th>{t('company.executions.stage')}</th>
                  <th>{t('company.executions.status')}</th>
                  <th>{t('company.executions.model')}</th>
                  <th className="r">{t('company.executions.tokens')}</th>
                </tr>
              </thead>
              <tbody>
                {executions.data.map((execution) => (
                  <tr key={execution.id}>
                    <td>
                      {execution.agent_instance_id ? (
                        <Link href={`${base}/company/agents/${encodeURIComponent(execution.agent_instance_id)}`}>{execution.role}</Link>
                      ) : execution.role}
                      <div className="id">{execution.blueprint_ref ?? '—'}</div>
                    </td>
                    <td className="id">{execution.stage}</td>
                    <td><Badge value={execution.status} family={familyFor(execution.status)} /></td>
                    <td className="id">
                      {execution.model ?? execution.provider ?? '—'}
                      {execution.served_by_fallback ? <> · <Badge value="FALLBACK" family="caution" human={t('company.executions.fallback')} /></> : null}
                    </td>
                    <td className="r">{execution.input_tokens} / {execution.output_tokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/executions</Source>
      </section>
    </>
  );
}
