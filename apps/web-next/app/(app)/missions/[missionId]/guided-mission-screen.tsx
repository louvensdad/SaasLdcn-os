'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { Signal } from '@/components/signal';
import { Badge, Kv, Live, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';

/** A deliverable job is finished when the backend says so; only then does polling stop. */
const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

export function GuidedMissionScreen({ missionId }: { readonly missionId: string }) {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const [stepId, setStepId] = useState<string | null>(null);

  const mission = useQuery({ queryKey: ['mission', missionId], queryFn: () => api.mission(missionId), retry: false });
  const job = useQuery({
    queryKey: ['mission-job', missionId],
    queryFn: () => api.latestDeliverableJob(missionId),
    retry: false,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status && !TERMINAL.has(status) ? 3000 : false;
    },
  });
  const handoff = useQuery({ queryKey: ['mission-handoff', missionId], queryFn: () => api.missionHandoff(missionId), retry: false });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['mission', missionId] });
    void queryClient.invalidateQueries({ queryKey: ['mission-job', missionId] });
  };
  const retry = useMutation({ mutationFn: (jobId: string) => api.retryDeliverableJob(missionId, jobId), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: (jobId: string) => api.cancelDeliverableJob(missionId, jobId), onSuccess: refresh });

  const data = mission.data;
  const jobData = job.data ?? null;

  if (mission.isPending) return <Skeleton lines={8} />;
  if (mission.isError || !data) {
    return (
      <PageState
        title={t('nav.missions')}
        kind="error"
        stateTitle={t('guided.unreadable')}
        action={<Link className="btn btn-quiet btn-sm" href="/new">{t('guided.start')}</Link>}
      >
        {t('guided.unreadableBody')}
      </PageState>
    );
  }

  const current = stepId ?? data.current_step_id ?? data.steps[0]?.id ?? null;
  const step = data.steps.find((entry) => entry.id === current) ?? null;
  const notes = data.step_notes.find((entry) => entry.step_id === current) ?? null;
  const stepDecisions = data.decisions.filter((decision) => decision.step_id === current);
  const openGaps = data.gaps.filter((gap) => !gap.dismissed);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.missions')}</span>
            <Badge value={data.status} family={familyFor(data.status)} />
            <span className="chip mono">{data.mode}</span>
            {data.degraded ? <Badge value="degraded" family="caution" /> : null}
          </div>
          <h1 className="title">{data.title}</h1>
          <p className="lede">{data.raw_intent || t('guided.noIntent')}</p>
        </div>
        <div className="btn-row">
          {data.linked_project_room_id ? (
            <Link className="btn btn-quiet" href={`/p/${encodeURIComponent(data.linked_project_room_id)}`}>{t('guided.openRoom')}</Link>
          ) : null}
        </div>
      </div>

      {data.last_failure ? (
        <Notice family="fault" title={t('guided.failure.title')}>
          <Kv
            pairs={[
              [t('guided.failure.endpoint'), <span className="mono" key="e">{data.last_failure.endpoint_called} → {data.last_failure.http_status}</span>],
              [t('guided.failure.status'), <span className="mono" key="s">{data.last_failure.status_current} · {t('guided.failure.expected', { list: data.last_failure.status_expected.join(', ') })}</span>],
              [t('guided.failure.reason'), data.last_failure.rejection_reason],
              [t('guided.failure.correction'), data.last_failure.correction],
            ]}
          />
        </Notice>
      ) : null}

      <div className="grid g-side-main g-start">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('guided.steps.title')}</h2>
            <span className="meta">{t('guided.steps.meta', { count: data.steps.length })}</span>
          </div>
          <div className="panel-body">
            {data.steps.length === 0 ? <p className="meta">{t('guided.steps.none')}</p> : null}
            <div className="list">
              {data.steps.map((entry) => {
                const answered = data.decisions.some((decision) => decision.step_id === entry.id);
                return (
                  <button className="li li-pick" key={entry.id} type="button" aria-current={entry.id === current} onClick={() => setStepId(entry.id)}>
                    <Signal family={answered ? 'proof' : entry.id === data.current_step_id ? 'hand' : 'idle'} label={entry.title} />
                    <span className="li-title" lang={data.locale}>{entry.title}</span>
                    <span className="meta mono">{answered ? t('guided.steps.answered') : t('guided.steps.open')}</span>
                  </button>
                );
              })}
            </div>
            <p className="meta">{t('guided.steps.note')}</p>
            <Source>GET /api/missions/{'{'}mission_id{'}'} · steps</Source>
          </div>
        </section>

        <div className="stack">
          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{step ? step.title : t('guided.step.none')}</h2>
            </div>
            <div className="panel-body stack">
              {step ? <p className="body ink2" lang={data.locale}>{step.description}</p> : <p className="meta">{t('guided.step.noneBody')}</p>}

              {notes && notes.key_points.length > 0 ? (
                <div>
                  <h3 className="h-sub">{t('guided.step.points')}</h3>
                  <div className="list">
                    {notes.key_points.map((point) => (
                      <div className="li" key={point}>
                        <Signal family="proof" label={point} />
                        <span className="li-title" lang={data.locale}>{point}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {notes && notes.open_questions.length > 0 ? (
                <div>
                  <h3 className="h-sub">{t('guided.step.questions')}</h3>
                  <div className="list">
                    {notes.open_questions.map((question) => (
                      <div className="li" key={question}>
                        <Signal family="hand" label={question} />
                        <span className="li-title" lang={data.locale}>{question}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              <div>
                <h3 className="h-sub">{t('guided.step.decisions', { count: stepDecisions.length })}</h3>
                {stepDecisions.length === 0 ? <p className="meta">{t('guided.step.noDecisions')}</p> : null}
                <div className="list">
                  {stepDecisions.map((decision) => (
                    <div className="li" key={decision.id}>
                      <Signal family={decision.source === 'user' ? 'hand' : 'proof'} label={decision.source} />
                      <span className="li-title">{String(decision.value)}</span>
                      <span className="li-aux">
                        <span className="meta mono">{decision.source}</span>
                        <span className="meta">{formatWhen(decision.created_at, locale)}</span>
                      </span>
                      {decision.reason ? <span className="li-sub">{decision.reason}</span> : null}
                    </div>
                  ))}
                </div>
                <p className="meta">{t('guided.step.note')}</p>
              </div>
              <Source>GET /api/missions/{'{'}mission_id{'}'} · step_notes · decisions</Source>
            </div>
          </section>

          {openGaps.length > 0 ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h-sub">{t('guided.gaps.title')}</h2>
                <span className="meta">{t('guided.gaps.meta', { count: openGaps.length })}</span>
              </div>
              <div className="panel-body">
                <div className="list">
                  {openGaps.map((gap) => (
                    <div className="li" key={gap.id}>
                      <Signal family={familyFor(gap.severity)} label={gap.severity} />
                      <span className="li-title" lang={data.locale}>{gap.title}</span>
                      <span className="li-aux">
                        <Badge value={gap.severity} family={familyFor(gap.severity)} />
                        <span className="meta mono">{gap.auto_detected ? t('guided.gaps.auto') : t('guided.gaps.manual')}</span>
                      </span>
                      <span className="li-sub" lang={data.locale}>{gap.description}</span>
                      <div className="chips"><span className="chip">{gap.suggested_action}</span></div>
                    </div>
                  ))}
                </div>
                <Source>GET /api/missions/{'{'}mission_id{'}'} · gaps</Source>
              </div>
            </section>
          ) : null}
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('guided.job.title')}</h2>
          {jobData ? (
            <Live state={TERMINAL.has(jobData.status) ? 'snapshot' : 'live'}>
              <Badge value={jobData.status} family={familyFor(jobData.status)} />
            </Live>
          ) : null}
          {jobData && !TERMINAL.has(jobData.status) ? (
            <button className="btn btn-quiet btn-sm" type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(jobData.id)}>
              {t('guided.job.cancel')}
            </button>
          ) : null}
          {jobData?.status === 'FAILED' ? (
            <button className="btn btn-quiet btn-sm" type="button" disabled={retry.isPending} onClick={() => retry.mutate(jobData.id)}>
              {t('guided.job.retry')}
            </button>
          ) : null}
        </div>

        {job.isError ? <p className="meta">{t('guided.job.unreadable')}</p> : null}
        {job.data === null ? <StateBlock kind="empty" title={t('guided.job.none')}>{t('guided.job.noneBody')}</StateBlock> : null}

        {jobData ? (
          <>
            {jobData.error ? (
              <Notice family="fault" title={t(`guided.job.error.${jobData.error.kind}`)}>
                {jobData.error.message}
                {jobData.error.artifact_type ? <span className="chip mono">{jobData.error.artifact_type}</span> : null}
              </Notice>
            ) : null}
            <div className="list">
              {jobData.artifacts_progress.map((artifact) => (
                <div className="li" key={artifact.type}>
                  <Signal family={familyFor(artifact.status)} label={artifact.status} />
                  <span className="li-title" lang={data.locale}>{artifact.title}</span>
                  <span className="li-aux">
                    <Badge value={artifact.status} family={familyFor(artifact.status)} />
                    <span className="meta mono">{artifact.model ?? jobData.requested_model ?? '—'}</span>
                  </span>
                  <span className="li-sub mono">{artifact.type}</span>
                  {artifact.status === 'ready' ? (
                    <div className="chips">
                      <span className="chip mono">{artifact.provider ?? '—'}</span>
                      <span className="chip mono">{t('guided.job.tokens', { input: artifact.input_tokens, output: artifact.output_tokens })}</span>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
            {jobData.retry_count > 0 ? <p className="meta">{t('guided.job.retries', { count: jobData.retry_count })}</p> : null}
            <p className="meta">{t('guided.job.note')}</p>
          </>
        ) : null}
        <Source>GET /api/missions/{'{'}mission_id{'}'}/deliverables/jobs/latest</Source>
      </section>

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('guided.handoff.title')}</h2></div>
        {handoff.isPending ? <Skeleton lines={2} /> : null}
        {handoff.isError ? <p className="meta">{t('guided.handoff.unreadable')}</p> : null}
        {handoff.data ? (
          <>
            <Kv
              pairs={[
                [t('guided.handoff.room'), handoff.data.project_room_id
                  ? <Link className="mono" key="room" href={`/p/${encodeURIComponent(handoff.data.project_room_id)}`}>{handoff.data.project_room_id}</Link>
                  : t('guided.handoff.noRoom')],
                [t('guided.handoff.roomStatus'), <span className="mono" key="rs">{handoff.data.room_status ?? '—'}</span>],
                [t('guided.handoff.engineering'), handoff.data.engineering_approved ? t('common.yes') : t('common.no')],
                [t('guided.handoff.stack'), handoff.data.stack_approved ? t('common.yes') : t('common.no')],
                [t('guided.handoff.generation'), handoff.data.generation_job_id
                  ? <span className="mono" key="g">{handoff.data.generation_job_id}</span>
                  : t('guided.handoff.noGeneration')],
              ]}
            />
            <p className="meta" style={{ marginTop: 10 }}>{t('guided.handoff.note')}</p>
          </>
        ) : null}
        <Source>GET /api/missions/{'{'}mission_id{'}'}/execution-handoff</Source>
      </section>
    </>
  );
}
