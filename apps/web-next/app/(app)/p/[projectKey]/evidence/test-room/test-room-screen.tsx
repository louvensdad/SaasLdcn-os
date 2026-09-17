'use client';

import type { Evidence, GateEvidence, TestRoomRun, TestRoomSessionView } from '@contracts/test-room.contract';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo } from 'react';

import { EvidenceLine } from '@/components/evidence-line';
import { ScopeMission, ScopeNoProject, ScopeNotice, ScopeUnresolved } from '@/components/mission-scope';
import { RunTimeline } from '@/components/run-timeline';
import { Icon, Signal } from '@/components/signal';
import { Badge, Kv, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { evidenceFamily, isResult, newestFirst, testRoomHref } from '@/lib/evidence/test-room';
import { formatDuration, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { missionScope, scopedProjectId } from '@/lib/project/mission-scope';
import { useProject, type ProjectData } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

/**
 * The Test Room: one stored session of a generated project, gate by gate, down to the evidence each gate recorded —
 * the command and its exit code, the HTTP probe and its status, the process, the artifact. The latest session by
 * default; `?session=` names another, `?mission=` the mission whose project it is.
 */
export function TestRoomScreen({ projectKey }: { readonly projectKey: string }) {
  const { t } = useI18n();
  const project = useProject(projectKey);
  const search = useSearchParams();
  const router = useRouter();
  const scope = missionScope(project, search.get('mission'));
  const generatedProjectId = scopedProjectId(scope);
  const sessionParam = search.get('session');
  const mission = scope.kind === 'mission' ? scope.mission.id : null;
  const base = `/p/${encodeURIComponent(projectKey)}`;
  const latestHref = testRoomHref(base);
  const queryClient = useQueryClient();

  const sessions = useQuery({
    queryKey: ['test-sessions', generatedProjectId],
    queryFn: () => api.testSessions(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const proof = useQuery({
    queryKey: ['test-room-proof', generatedProjectId],
    queryFn: () => api.testRoomProof(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const profile = useQuery({
    queryKey: ['test-profile', generatedProjectId],
    queryFn: () => api.testProfile(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const run = useMutation({
    mutationFn: () => api.runTests(String(generatedProjectId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['test-sessions', generatedProjectId] });
      void queryClient.invalidateQueries({ queryKey: ['test-room-proof', generatedProjectId] });
      /* The run stored a new session, and the newest is what the room shows when none is named. */
      if (sessionParam) router.replace(testRoomHref(base, { mission }));
    },
  });

  const ordered = useMemo(() => newestFirst(sessions.data ?? []), [sessions.data]);
  const session = sessionParam ? ordered.find((entry) => entry.id === sessionParam) ?? null : ordered[0] ?? null;

  if (scope.kind === 'pending') return <Skeleton lines={6} />;
  if (scope.kind === 'unresolved') return <ScopeUnresolved scope={scope} title={t('testroom.title')} base={base} latestHref={latestHref} />;
  if (!generatedProjectId) {
    if (scope.kind === 'mission') {
      return <ScopeNoProject scope={scope} title={t('testroom.title')} emptyTitle={t('testroom.none')} illustration="evidence" base={base} latestHref={latestHref} />;
    }
    if (project.jobs.isPending) return <Skeleton lines={6} />;
    /* Without the missions nothing names a generated project: that is not the same as "nothing was tested". */
    if (project.jobs.isError) {
      return (
        <PageState title={t('testroom.title')} kind="unknown" stateTitle={t('testroom.missionsUnreadable')} illustration="unreachable">
          {t('testroom.missionsUnreadableBody')}
        </PageState>
      );
    }
    return (
      <PageState title={t('testroom.title')} kind="empty" stateTitle={t('testroom.none')} illustration="evidence">
        {t('testroom.noneBody')}
      </PageState>
    );
  }

  const unsupported = profile.data?.status === 'unsupported';

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.evidence')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            <ScopeMission scope={scope} base={base} />
            {proof.data ? <Badge value={proof.data.proven ? 'PROVEN' : 'NOT_PROVEN'} family={proof.data.proven ? 'proof' : 'idle'} /> : null}
          </div>
          <h1 className="title">{t('testroom.title')}</h1>
          <p className="lede">{t('testroom.lede')}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" disabled={run.isPending || unsupported} onClick={() => run.mutate()}>
            <Icon name="play" /> {run.isPending ? t('testroom.running') : ordered.length > 0 ? t('testroom.runAgain') : t('testroom.runFirst')}
          </button>
        </div>
      </div>

      <ScopeNotice scope={scope} latestHref={latestHref} />
      {unsupported ? <Notice family="caution" title={t('testroom.unsupported')}>{profile.data?.reason ?? ''}</Notice> : null}
      {run.isError ? <Notice family="fault" title={t('testroom.runFailed')}>{String(run.error)}</Notice> : null}
      {run.data ? <RunOutput run={run.data} /> : null}

      {sessions.isPending ? <Skeleton lines={6} /> : null}
      {sessions.isError ? <StateBlock kind="unknown" title={t('testroom.sessions.unreadable')} /> : null}
      {sessions.isSuccess && ordered.length === 0 ? (
        <StateBlock kind="empty" title={t('testroom.sessions.none')} illustration="evidence">{t('testroom.sessions.noneBody')}</StateBlock>
      ) : null}
      {sessions.isSuccess && sessionParam && !session ? (
        <StateBlock
          kind="unknown"
          title={t('testroom.session.missing', { id: sessionParam })}
          action={<div className="btn-row"><Link className="btn btn-ghost btn-sm" href={testRoomHref(base, { mission })}>{t('testroom.session.showLatest')}</Link></div>}
        />
      ) : null}

      {session ? (
        <SessionView
          session={session}
          sessions={ordered}
          passingId={proof.data?.passing_session_id ?? null}
          proven={proof.data?.proven ?? false}
          project={project}
          base={base}
          mission={mission}
        />
      ) : null}
    </>
  );
}

function SessionView({ session, sessions, passingId, proven, project, base, mission }: {
  readonly session: TestRoomSessionView;
  readonly sessions: readonly TestRoomSessionView[];
  readonly passingId: string | null;
  readonly proven: boolean;
  readonly project: ProjectData;
  readonly base: string;
  readonly mission: string | null;
}) {
  const { t, locale } = useI18n();
  const took = session.finished_at ? Date.parse(session.finished_at) - Date.parse(session.started_at) : Number.NaN;
  const ranFor = session.generation_job_id ? project.missions.find((job) => job.id === session.generation_job_id) ?? null : null;
  /* The passing session on record proves the project only while no later session has failed. */
  const record = passingId !== session.id ? null : proven ? 'proves' : 'superseded';

  return (
    <>
      <div className="facts">
        <div className="fact">
          <span className="label">{t('testroom.fact.status')}</span>
          <div className="v"><Badge value={session.status} family={familyFor(session.status)} /></div>
        </div>
        <div className="fact">
          <span className="label">{t('testroom.fact.stage')}</span>
          <div className="v mono">{session.stage}</div>
        </div>
        <div className="fact">
          <span className="label">{t('testroom.fact.took')}</span>
          <div className="v">{Number.isFinite(took) && took >= 0 ? formatDuration(took, locale) : t('testroom.run.unfinished')}</div>
        </div>
        <div className="fact">
          <span className="label">{t('testroom.fact.proof')}</span>
          <div className="v">
            {record ? (
              <span className="row" style={{ gap: 6 }}>
                <Signal family={record === 'proves' ? 'proof' : 'idle'} />
                {t(record === 'proves' ? 'testroom.proves' : 'testroom.superseded')}
              </span>
            ) : <small>{t('testroom.notPassing')}</small>}
          </div>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('testroom.run.title')}</h2>
          <span className="meta">{t('testroom.run.note')}</span>
        </div>
        {session.reason ? <p className="body ink2 wrap-any">{session.reason}</p> : null}
        <RunTimeline session={session} label={t('testroom.run.label', { session: session.id })} />
        <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · started_at, finished_at, gates[].evidence[].observed_at</Source>
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('testroom.gates.title')}</h2>
          <span className="meta">{t('testroom.gates.meta', { count: session.gates.length })}</span>
        </div>
        {session.gates.length > 0 ? (
          <EvidenceLine
            label={t('verification.gates.label', { session: session.id })}
            stations={session.gates.map((gate) => ({ id: gate.gate, name: gate.label || gate.gate, state: gate.status, family: evidenceFamily(gate.status) }))}
          />
        ) : <p className="meta">{t('testroom.gates.none')}</p>}
        <div className="stack" style={{ marginTop: 14 }}>
          {session.gates.map((gate) => <GatePanel key={gate.gate} gate={gate} />)}
        </div>
        <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · gates[].evidence, blockers, warnings</Source>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('testroom.record.title')}</h2></div>
          <Kv
            pairs={[
              [t('testroom.record.session'), <span key="s" className="mono">{session.id}</span>],
              [t('testroom.record.mission'), !session.generation_job_id
                ? <span key="m" className="meta">{t('testroom.record.noMission')}</span>
                : ranFor
                  ? <Link key="m" href={`${base}/missions/${encodeURIComponent(ranFor.id)}`}>{t('scope.mission', { when: formatWhen(ranFor.createdAt, locale) })}</Link>
                  : <span key="m" className="mono">{session.generation_job_id}</span>],
              [t('testroom.record.profile'), <span key="p" className="mono">{session.profile_id ?? '—'}</span>],
              [t('testroom.record.started'), formatWhen(session.started_at, locale)],
              [t('testroom.record.finished'), session.finished_at ? formatWhen(session.finished_at, locale) : t('testroom.run.unfinished')],
              [t('testroom.record.file'), session.artifact_path ? <span key="a" className="mono wrap-any">{session.artifact_path}</span> : '—'],
              [t('testroom.record.refs'), session.evidence_refs.length > 0
                ? <span key="r" className="chips">{session.evidence_refs.map((ref) => <span key={ref} className="chip mono">{ref}</span>)}</span>
                : '—'],
            ]}
          />
          <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · GET /api/test-room/{'{'}project_id{'}'}/proof</Source>
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('testroom.history.title')}</h2>
            <span className="meta">{t('testroom.history.meta', { count: sessions.length })}</span>
          </div>
          <nav className="list" aria-label={t('testroom.history.title')}>
            {sessions.map((entry) => (
              <Link
                key={entry.id}
                className="li li-link li-pick"
                href={testRoomHref(base, { mission, session: entry.id })}
                aria-current={entry.id === session.id ? 'true' : undefined}
              >
                <Signal family={familyFor(entry.status)} label={entry.status} />
                <span className="li-title">{formatWhen(entry.started_at, locale)}</span>
                <span className="meta mono">{entry.status}</span>
                <span className="li-sub">
                  <span className="mono">{entry.id}</span>
                  {entry.id === passingId ? ` · ${t('testroom.history.passing')}` : ''}
                </span>
              </Link>
            ))}
          </nav>
        </section>
      </div>
    </>
  );
}

function GatePanel({ gate }: { readonly gate: GateEvidence }) {
  const { t } = useI18n();
  const family = evidenceFamily(gate.status);
  const tests = gate.gate === 'tests' || gate.evidence.some((evidence) => evidence.kind === 'test_run');
  return (
    <section className="panel" aria-label={gate.label || gate.gate}>
      <div className="panel-head">
        <h3 className="h-sub">{gate.label || gate.gate}</h3>
        <Badge value={gate.status} family={family} />
        <span className="id dev-only">{gate.gate}</span>
      </div>
      <div className="panel-body stack">
        {gate.reason ? <p className="body ink2">{gate.reason}</p> : null}
        {gate.blockers.length > 0 ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">{t('testroom.gate.blockers')}</span>
            <span className="chips">{gate.blockers.map((item) => <span key={item} className="chip mono">{item}</span>)}</span>
          </div>
        ) : null}
        {gate.warnings.length > 0 ? (
          <div className="stack" style={{ gap: 4 }}>
            <span className="label">{t('testroom.gate.warnings')}</span>
            <span className="chips">{gate.warnings.map((item) => <span key={item} className="chip mono">{item}</span>)}</span>
          </div>
        ) : null}
        {gate.evidence.length === 0 ? <p className="meta">{t('testroom.gate.noEvidence')}</p> : (
          <div className="list">
            {gate.evidence.map((evidence, index) => <EvidenceRow key={`${evidence.id}:${index}`} evidence={evidence} />)}
          </div>
        )}
        {tests ? <p className="meta">{t('testroom.tests.note')}</p> : null}
      </div>
    </section>
  );
}

/* Proof in the backend's own notation: an exit code, an HTTP status, a port. The duration in the reader's units. */
function readings(evidence: Evidence, locale: Parameters<typeof formatDuration>[1]): readonly string[] {
  const out: string[] = [];
  if (evidence.exit_code != null) out.push(`exit ${evidence.exit_code}`);
  if (evidence.http_status != null) out.push(`HTTP ${evidence.http_status}`);
  if (evidence.duration_ms != null) out.push(formatDuration(evidence.duration_ms, locale));
  const port = evidence.detail?.port;
  if (port != null) out.push(`:${port}`);
  return out;
}

function EvidenceRow({ evidence }: { readonly evidence: Evidence }) {
  const { t, locale } = useI18n();
  const family = evidenceFamily(evidence.status);
  const proof = readings(evidence, locale);
  const details = Object.entries(evidence.detail ?? {}).filter(([key]) => key !== 'port');
  return (
    <div className="li tr-evidence">
      <Signal family={family} label={evidence.label} />
      <span className="li-title mono">{evidence.label}</span>
      <span className="meta mono">{evidence.status}</span>
      <span className="li-sub">
        <svg className="ico tr-kind" aria-hidden="true"><use href={`#ev-${evidence.kind}`} /></svg>
        {t(`runmap.kind.${evidence.kind}`)}
        {proof.length > 0 ? ` · ${proof.join(' · ')}` : ''}
        {` · ${formatWhen(evidence.observed_at, locale)}`}
      </span>
      {/* A step that produced no result says why, in the backend's words, next to the step and never as a warning. */}
      {!isResult(evidence) && evidence.reason ? <span className="li-sub ink2">{evidence.reason}</span> : null}
      {evidence.command && evidence.command !== evidence.label ? <span className="li-sub mono">{evidence.command}</span> : null}
      {evidence.artifact_path ? (
        <span className="li-sub mono">
          {evidence.artifact_path}
          {evidence.artifact_sha256 ? ` · sha256 ${evidence.artifact_sha256.slice(0, 12)}` : ''}
        </span>
      ) : null}
      {details.length > 0 ? (
        <span className="chips">{details.map(([key, value]) => <span key={key} className="chip mono">{key}: {String(value)}</span>)}</span>
      ) : null}
    </div>
  );
}

/* What a run started here returned: its verdict and the application's output, which stored sessions are not read with. */
function RunOutput({ run }: { readonly run: TestRoomRun }) {
  const { t } = useI18n();
  return (
    <section className="panel" aria-label={t('testroom.output.title')}>
      <div className="panel-head">
        <h2 className="h-sub">{t('testroom.output.title')}</h2>
        <Badge value={run.status} family={familyFor(run.status)} />
      </div>
      <div className="panel-body stack">
        {run.reason ? <p className="body ink2">{run.reason}</p> : null}
        {run.logs_tail ? <pre className="json">{run.logs_tail}</pre> : <p className="meta">{t('testroom.output.empty')}</p>}
        <p className="meta">{t('testroom.output.note')}</p>
        <Source>POST /api/test-room/{'{'}project_id{'}'}/run · status, reason, logs_tail</Source>
      </div>
    </section>
  );
}
