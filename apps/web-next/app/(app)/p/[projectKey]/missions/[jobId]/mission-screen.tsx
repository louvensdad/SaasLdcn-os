'use client';

import type { GenerationExecutionEvent, ResilientGenerationJob } from '@contracts/generation-job.contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { MissionMap } from '@/components/drawings/mission-map';
import { EvidenceLine } from '@/components/evidence-line';
import { HeroLink } from '@/components/hero-link';
import { Icon, Signal, type Family } from '@/components/signal';
import { Badge, GapChip, Kv, Live, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { testRoomHref } from '@/lib/evidence/test-room';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useStatusLabel } from '@/lib/i18n/status-label';
import { STAGE_FAMILY } from '@/lib/mission/mission-map';
import { useMission } from '@/lib/mission/use-mission';
import { missionQuery } from '@/lib/project/mission-scope';
import { GATE_FAMILY } from '@/lib/runtime/runtime-chain';
import { familyFor, isRunning } from '@/lib/status';

type ConsoleFilter = 'all' | 'artifacts' | 'commands' | 'repairs';

const FILTERS: Readonly<Record<ConsoleFilter, readonly string[]>> = {
  all: [],
  artifacts: ['artifact_written'],
  commands: ['command_started', 'command_output', 'command_finished', 'command_skipped'],
  repairs: ['repair_started', 'repair_applied', 'repair_failed'],
};


function eventFamily(event: GenerationExecutionEvent): Family {
  if (event.level === 'error') return 'fault';
  if (event.level === 'warning') return 'caution';
  if (event.type === 'artifact_written' || event.type === 'stage_finished' || event.type === 'pipeline_complete') return 'proof';
  if (event.type === 'command_skipped') return 'na';
  if (event.type.endsWith('_started')) return 'pulse';
  return 'idle';
}

/** Every decision this mission can raise, each one from the field that raises it. */
function missionDecisions(job: ResilientGenerationJob) {
  const out: { readonly id: string; readonly rule: string; readonly source: string; readonly action: 'approveRepair' | 'continue' | 'buildSkip' | 'resume' }[] = [];
  if (job.awaitingRepairApproval) out.push({ id: 'repair', rule: 'approveRepair', source: 'awaitingRepairApproval', action: 'approveRepair' });
  if (job.status === 'NEEDS_USER_ACTION' && !job.awaitingRepairApproval) out.push({ id: 'warnings', rule: 'continueWarnings', source: 'status · NEEDS_USER_ACTION', action: 'continue' });
  if (job.status === 'STALLED') out.push({ id: 'stalled', rule: 'continueStalled', source: 'status · STALLED', action: 'continue' });
  if (job.status === 'PAUSED') out.push({ id: 'paused', rule: 'resume', source: 'status · PAUSED', action: 'resume' });
  if (job.buildStatus === 'SKIPPED_AFTER_FAILURE' && !job.buildSkipAcknowledged) {
    out.push({ id: 'build', rule: 'buildSkip', source: 'buildStatus · SKIPPED_AFTER_FAILURE', action: 'buildSkip' });
  }
  return out;
}

/**
 * Where the project this mission generated runs, and what proves it: the gates of its latest Test Room session and the
 * kernel phase, each linked to its screen for this mission's project — not for whichever mission is the latest.
 */
function MissionProof({ base, job }: { readonly base: string; readonly job: ResilientGenerationJob }) {
  const { t, locale } = useI18n();
  const generatedProjectId = job.generatedProjectId ?? null;
  const sessions = useQuery({
    queryKey: ['test-sessions', generatedProjectId],
    queryFn: () => api.testSessions(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const kernel = useQuery({
    queryKey: ['kernel', generatedProjectId],
    queryFn: () => api.kernel(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const latest = useMemo(
    () => [...(sessions.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null,
    [sessions.data],
  );
  const scope = missionQuery(job.id);

  return (
    <section className="panel">
      <div className="panel-head"><h2 className="h-sub">{t('mission.proof.title')}</h2></div>
      <div className="panel-body stack">
        {!generatedProjectId ? (
          <StateBlock kind="empty" title={t('mission.proof.none')}>{t('mission.proof.noneBody')}</StateBlock>
        ) : (
          <>
            <Kv
              pairs={[
                [t('mission.proof.session'), latest
                  ? <span key="s" className="row" style={{ gap: 8 }}><Badge value={latest.status} family={familyFor(latest.status)} /><span className="meta">{formatWhen(latest.started_at, locale)}</span></span>
                  : <span key="s" className="meta">{sessions.isPending ? '…' : sessions.isError ? t('mission.proof.sessionsUnreadable') : t('mission.proof.noSession')}</span>],
                [t('mission.proof.kernel'), kernel.data
                  ? <Badge key="k" value={kernel.data.kernel_phase} family={familyFor(kernel.data.kernel_phase)} />
                  : <span key="k" className="meta">{kernel.isPending ? '…' : t('project.evidence.unreadable')}</span>],
              ]}
            />
            {latest && latest.gates.length > 0 ? (
              <EvidenceLine
                size="sm"
                label={t('mission.proof.gates')}
                stations={latest.gates.map((gate) => ({
                  id: gate.gate, name: gate.label || gate.gate, state: gate.status, family: GATE_FAMILY[gate.status] ?? familyFor(gate.status),
                }))}
              />
            ) : null}
            <div className="btn-row">
              {/* The chain travels into the runtime screen, which draws it in full. */}
              <HeroLink
                className="btn btn-ghost btn-sm"
                href={`${base}/runtime${scope}`}
                hero={(link) => link.closest('.panel')?.querySelector<HTMLElement>('.evl') ?? link}
              >
                {t('links.openRuntime')}
              </HeroLink>
              <HeroLink className="btn btn-ghost btn-sm" href={`${base}/evidence${scope}`}>{t('links.openEvidence')}</HeroLink>
              <HeroLink className="btn btn-ghost btn-sm" href={testRoomHref(base, { mission: job.id })}>{t('links.openTestRoom')}</HeroLink>
            </div>
            <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · GET /api/meta-factory/{'{'}project_id{'}'}/engineering-kernel · generatedProjectId</Source>
          </>
        )}
      </div>
    </section>
  );
}

export function MissionScreen({ projectKey, jobId }: { readonly projectKey: string; readonly jobId: string }) {
  const { t, tDynamic, locale } = useI18n();
  const say = useStatusLabel();
  const { job, events, state, lastEventId, timeoutMessage, isPending, isError } = useMission(jobId);
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<ConsoleFilter>('all');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const base = `/p/${encodeURIComponent(projectKey)}`;

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['job', jobId] });
    void queryClient.invalidateQueries({ queryKey: ['jobs'] });
  };
  const control = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'approveRepair' | 'continue' | 'buildSkip') => {
      if (action === 'pause') return api.pauseJob(jobId);
      if (action === 'resume') return api.resumeJob(jobId);
      if (action === 'approveRepair') return api.approveRepair(jobId);
      if (action === 'buildSkip') return api.continueAfterBuildSkip(jobId);
      return api.continueWithWarnings(jobId);
    },
    onSuccess: invalidate,
  });
  const retry = useMutation({
    mutationFn: ({ stage, mode }: { readonly stage: string; readonly mode: 'normal' | 'partitioned' | 'deterministic' }) => api.retryStage(jobId, stage, mode),
    onSuccess: invalidate,
  });
  const diagnostic = useMutation({
    mutationFn: () => api.diagnostic(jobId),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${jobId}-diagnostic.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    },
  });

  const stages = useMemo(() => Object.entries(job?.stageStatuses ?? {}), [job?.stageStatuses]);
  /* `stageStatuses` is keyed by the logical stage (backend), while `currentStage` and a checkpoint's `stage` carry the
     granular status (BACKEND_GENERATING) and an artifact's `stage` the logical one — so the stage in focus is derived
     from the statuses themselves and matched by prefix. */
  const activeStage = stages.find(([, status]) => status === 'running')?.[0]
    ?? stages.find(([, status]) => status === 'failed' || status === 'stalled')?.[0]
    ?? [...stages].reverse().find(([, status]) => status === 'success')?.[0]
    ?? stages[0]?.[0]
    ?? '';
  const stage = selectedStage ?? activeStage;
  const belongsToStage = (value: string) => Boolean(stage) && value.toLowerCase().startsWith(stage.toLowerCase());
  const stageStatus = job?.stageStatuses[stage];
  /* Re-running a stage is only offered when the backend's own status says it is not in flight. */
  const canRetry = Boolean(job) && stageStatus !== 'running' && stageStatus !== 'waiting'
    && (stageStatus === 'failed' || stageStatus === 'stalled' || stageStatus === 'retrying' || !isRunning(job!.status));
  const stageCheckpoints = (job?.checkpoints ?? []).filter((checkpoint) => belongsToStage(checkpoint.stage));
  const stageArtifacts = (job?.artifacts ?? []).filter((artifact) => belongsToStage(artifact.stage));
  const shownEvents = useMemo(
    () => (filter === 'all' ? events : events.filter((event) => FILTERS[filter].includes(event.type))),
    [events, filter],
  );
  const decisions = job ? missionDecisions(job) : [];

  if (isPending) return <Skeleton lines={8} />;
  if (!job) {
    return (
      <PageState title={t('nav.missions')} kind="unknown" stateTitle={t('mission.missing.title')} illustration="mission" action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={`${base}/missions`}>{t('nav.missions')}</Link></div>}>
        {t(isError ? 'mission.missing.body' : 'mission.missing.bodyUnknown', { id: jobId })}
      </PageState>
    );
  }

  const liveState = state === 'live' ? 'live' : state === 'ended' ? 'snapshot' : state === 'timeout' || state === 'failed' ? 'paused' : 'stale';
  const liveLabel = state === 'live' ? t('mission.stream.live', { id: lastEventId ?? '—' })
    : state === 'reconnecting' ? t('mission.stream.reconnecting', { id: lastEventId ?? '—' })
      : state === 'connecting' ? t('mission.stream.connecting')
        : state === 'ended' ? t('mission.stream.ended')
          : state === 'timeout' ? t('mission.stream.timeout')
            : t('mission.stream.failed');

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.missions')}</span>
            <span className="chip mono">{job.id}</span>
            <Live state={liveState}>{liveLabel}</Live>
          </div>
          <h1 className="display">{job.projectName}</h1>
          <p className="lede">{t('mission.lede', { stage: say(job.currentStage) })}</p>
        </div>
        <div className="btn-row">
          {isRunning(job.status) ? (
            <button className="btn btn-ghost" type="button" disabled={control.isPending} onClick={() => control.mutate('pause')}>
              <Icon name="pause" /> {t('mission.pause')}
            </button>
          ) : null}
          {job.status === 'PAUSED' || job.status === 'STALLED' ? (
            <button className="btn btn-primary" type="button" disabled={control.isPending} onClick={() => control.mutate('resume')}>
              <Icon name="play" /> {t('mission.resume')}
            </button>
          ) : null}
          <button className="btn btn-ghost" type="button" disabled={diagnostic.isPending} onClick={() => diagnostic.mutate()}>
            <Icon name="download" /> {t('mission.diagnostic')}
          </button>
        </div>
      </div>

      {state === 'timeout' ? <Notice family="caution" title={t('mission.stream.timeout')}>{timeoutMessage ?? ''}</Notice> : null}
      {control.isError ? <Notice family="fault" title={t('mission.actionFailed')}>{String(control.error)}</Notice> : null}

      <div className="facts">
        <div className="fact">
          <span className="label">{t('mission.fact.status')}</span>
          <div className="v"><Badge value={job.status} family={familyFor(job.status)} live={isRunning(job.status)} /></div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.stage')}</span>
          <div className="v mono">{job.currentStage}</div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.step')}</span>
          <div className="v num">{job.progress}%</div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.started')}</span>
          <div className="v">{formatWhen(job.startedAt, locale)}</div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.model')}</span>
          <div className="v mono">{job.model ?? job.providerLabel}</div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.build')}</span>
          <div className="v"><Badge value={job.buildStatus} family={familyFor(job.buildStatus)} /></div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.retries')}</span>
          <div className="v num">{job.retryCount}</div>
        </div>
        <div className="fact">
          <span className="label">{t('mission.fact.blueprint')}</span>
          <div className="v num">v{job.blueprintVersion}</div>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('map.label')}</h2>
          <span className="meta">{stages.length > 0 ? t('mission.pipeline.meta', { count: stages.length }) : t('mission.pipeline.none')}</span>
        </div>
        <MissionMap projectKey={projectKey} job={job} stage={stage} onStage={setSelectedStage} />
      </section>

      <div className="grid g-main-side">
        <div className="stack-lg">
          <section className="panel" id="stage-panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('mission.stage.title', { stage })}</h2>
              {stageStatus ? <Badge value={stageStatus} family={STAGE_FAMILY[stageStatus] ?? 'unknown'} live={stageStatus === 'running'} /> : null}
              <div className="actions">
                {(['normal', 'partitioned', 'deterministic'] as const).map((mode) => (
                  <button
                    key={mode}
                    className="btn btn-ghost btn-sm"
                    type="button"
                    disabled={retry.isPending || !canRetry}
                    title={canRetry ? t('mission.stage.retryHint') : t('mission.stage.retryWhen')}
                    onClick={() => retry.mutate({ stage, mode })}
                  >
                    <Icon name="retry" /> {t(`mission.stage.retry.${mode}`)}
                  </button>
                ))}
              </div>
            </div>
            <div className="panel-body stack">
              {stageCheckpoints.length === 0 && stageArtifacts.length === 0 ? <p className="meta">{t('mission.stage.empty')}</p> : null}
              {stageCheckpoints.length > 0 ? (
                <div className="list">
                  {stageCheckpoints.map((checkpoint) => (
                    <div className="li" key={checkpoint.id}>
                      <Signal family={STAGE_FAMILY[checkpoint.status] ?? 'unknown'} label={checkpoint.status} />
                      <span className="li-title mono">{checkpoint.chunk || checkpoint.stage}</span>
                      <span className="meta num">{checkpoint.estimated_tokens > 0 ? t('mission.stage.tokens', { count: checkpoint.estimated_tokens }) : ''}</span>
                      <span className="li-sub">
                        {checkpoint.status} · {t('mission.stage.attempt', { n: checkpoint.attempt })}
                        {checkpoint.partitioned ? ` · ${t('mission.stage.partitioned')}` : ''}
                        {checkpoint.detail ? ` · ${checkpoint.detail}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {stageArtifacts.length > 0 ? (
                <div className="list">
                  {stageArtifacts.map((artifact) => (
                    <div className="li" key={artifact.id}>
                      <Signal family={artifact.valid ? 'proof' : 'caution'} label={artifact.name} />
                      <span className="li-title mono">{artifact.path}</span>
                      <span className="meta num">{artifact.size_bytes} B</span>
                      <span className="li-sub">{artifact.kind}{artifact.warnings.length > 0 ? ` · ${t('mission.stage.warnings', { count: artifact.warnings.length })}` : ''}</span>
                    </div>
                  ))}
                </div>
              ) : null}
              <Source>GET /api/meta-factory/jobs/{'{'}job_id{'}'} · checkpoints, artifacts, stageStatuses</Source>
            </div>
          </section>

          <section className="console" aria-label={t('mission.console.title')}>
            <div className="console-head">
              <h2 className="h-sub">{t('mission.console.title')}</h2>
              <Live state={liveState}>{liveLabel}</Live>
              <div className="actions seg" role="group" aria-label={t('mission.console.filter')}>
                {(Object.keys(FILTERS) as ConsoleFilter[]).map((key) => (
                  <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{t(`mission.console.${key}`)}</button>
                ))}
              </div>
            </div>
            <div className="console-body">
              {shownEvents.length === 0 ? <p className="meta" style={{ padding: '10px 12px' }}>{t('mission.console.empty')}</p> : null}
              {shownEvents.map((event) => (
                <div className="ev" key={event.id}>
                  <span className="ev-time">{new Date(event.timestamp).toLocaleTimeString(locale)}</span>
                  <Signal family={eventFamily(event)} label={event.type} />
                  <span className="ev-type">{event.type}</span>
                  <span className="ev-msg">{event.message}</span>
                  <span className="ev-meta">
                    {event.stage}
                    {event.exitCode != null ? ` · exit ${event.exitCode}` : ''}
                    {event.durationMs != null ? ` · ${Math.round(event.durationMs)} ms` : ''}
                    {event.role ? ` · ${event.role}` : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <Source>GET /api/meta-factory/jobs/{'{'}job_id{'}'}/events · execution_event · generation_job · heartbeat · stream_timeout</Source>
        </div>

        <div className="stack-lg">
          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('mission.waiting.title')}</h2></div>
            <div className="panel-body stack">
              {decisions.length === 0 ? (
                <StateBlock kind="empty" title={t('mission.waiting.none')}>{t('mission.waiting.noneBody')}</StateBlock>
              ) : (
                decisions.map((decision) => (
                  <article className="decision" key={decision.id}>
                    <Signal family="hand" label={tDynamic(`mission.decision.${decision.rule}`)} />
                    <div className="decision-body">
                      <h3 className="decision-title">{tDynamic(`mission.decision.${decision.rule}`)}</h3>
                      <p className="decision-why">{tDynamic(`mission.decision.${decision.rule}.why`)}</p>
                      <div className="decision-meta"><Source>{decision.source}</Source></div>
                      <div className="decision-actions">
                        <button className="btn btn-hand btn-sm" type="button" disabled={control.isPending} onClick={() => control.mutate(decision.action)}>
                          {tDynamic(`mission.decision.${decision.rule}.action`)}
                        </button>
                      </div>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {job.error ? (
            <section className="panel">
              <div className="panel-head">
                <h2 className="h-sub">{t('mission.failure.title')}</h2>
                <Badge value={job.error.kind} family={job.error.kind === 'stall' ? 'hand' : 'fault'} />
              </div>
              <div className="panel-body stack">
                <p className="body ink2">{job.error.message}</p>
                <Kv
                  pairs={[
                    [t('mission.failure.stage'), <span key="s" className="mono">{job.error.stage}</span>],
                    [t('mission.failure.agent'), <span key="a" className="mono">{job.error.agent}</span>],
                    [t('mission.failure.reason'), job.error.reason],
                    [t('mission.failure.action'), job.error.recommended_action],
                    [t('mission.failure.counts'), t('mission.failure.countsValue', {
                      blocking: job.error.blocking_count, errors: job.error.error_count, warnings: job.error.warning_count,
                    })],
                    [t('mission.failure.continue'), job.error.can_continue_with_warnings ? t('mission.failure.continueYes') : t('mission.failure.continueNo')],
                  ]}
                />
                {job.error.classification ? <Badge value={job.error.classification} family={familyFor(job.error.classification)} /> : null}
                <Source>GET /api/meta-factory/jobs/{'{'}job_id{'}'} · error</Source>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('mission.company.title')}</h2>
              <div className="actions">
                <Link className="btn btn-quiet btn-sm" href={`${base}/missions/${jobId}/company`}>{t('common.open')}</Link>
              </div>
            </div>
            <div className="panel-body">
              {job.virtualCompany ? (
                <>
                  <Kv
                    pairs={[
                      [t('mission.company.state'), <Badge key="c" value={job.virtualCompany.status} family={job.virtualCompany.status === 'OPEN' ? 'pulse' : 'proof'} />],
                      [t('mission.company.instances'), <span key="i" className="num">{job.virtualCompany.instances.length}</span>],
                    ]}
                  />
                  <Source>GET /api/meta-factory/jobs/{'{'}job_id{'}'} · virtualCompany</Source>
                </>
              ) : (
                <p className="meta">{t('mission.company.none')}</p>
              )}
            </div>
          </section>

          <MissionProof base={base} job={job} />

          <section className="panel">
            <div className="panel-head">
              <h2 className="h-sub">{t('mission.usage.title')}</h2>
              <GapChip id="G19" detail={t('mission.usage.gap')} />
            </div>
            <div className="panel-body stack">
              <p className="meta">{t('mission.usage.body')}</p>
              <Link className="btn btn-quiet btn-sm" href="/settings/ai">{t('command.provider.details')}</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
