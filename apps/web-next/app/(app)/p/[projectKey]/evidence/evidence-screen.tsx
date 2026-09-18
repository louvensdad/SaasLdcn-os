'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';

import { ProofGraph } from '@/components/drawings/proof-graph';
import { HeroLink } from '@/components/hero-link';
import { ScopeMission, ScopeNoProject, ScopeNotice, ScopeUnresolved } from '@/components/mission-scope';
import { Signal, type Family } from '@/components/signal';
import { Badge, Kv, Failure, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatWhen } from '@/lib/format';
import { proofModel } from '@/lib/evidence/proof-graph';
import { newestFirst, testRoomHref } from '@/lib/evidence/test-room';
import { useI18n } from '@/lib/i18n/i18n';
import { missionScope, scopedProjectId, scopeQuery } from '@/lib/project/mission-scope';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

/** The backend compares these literally, in Portuguese, whatever the reader's language is. */
const RELEASE_PHRASE = 'LIBERAR COM RISCO';
const REVIEW_PHRASE = 'REVISADO PELO HUMANO';

const SEVERITY: Readonly<Record<string, Family>> = { BLOCKER: 'fault', WARNING: 'caution', INFO: 'idle' };

export function EvidenceScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const { latest } = project;
  const search = useSearchParams();
  /* Which generated project this screen reads: the latest mission's, or the one a linked mission generated. */
  const scope = missionScope(project, search.get('mission'));
  const generatedProjectId = scopedProjectId(scope);
  /* Chief verifies a mission: the linked one when a mission is named, otherwise the latest as before. */
  const chiefJobId = scope.kind === 'mission' ? scope.mission.id : latest?.id;
  const base = `/p/${encodeURIComponent(projectKey)}`;
  const latestHref = `${base}/evidence`;
  const queryClient = useQueryClient();
  const [releasePhrase, setReleasePhrase] = useState('');
  const [reviewPhrase, setReviewPhrase] = useState('');

  const kernel = useQuery({
    queryKey: ['kernel', generatedProjectId],
    queryFn: () => api.kernel(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const quality = useQuery({
    queryKey: ['quality', generatedProjectId],
    queryFn: () => api.qualityReport(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const chief = useQuery({
    queryKey: ['chief', chiefJobId],
    queryFn: () => api.chief(String(chiefJobId)),
    enabled: Boolean(chiefJobId),
    retry: false,
  });
  const proof = useQuery({
    queryKey: ['test-room-proof', generatedProjectId],
    queryFn: () => api.testRoomProof(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const sessions = useQuery({
    queryKey: ['test-sessions', generatedProjectId],
    queryFn: () => api.testSessions(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });

  /* The Test Room of the same project, at the session the graph's gates were read from. */
  const latestSession = useMemo(() => newestFirst(sessions.data ?? [])[0] ?? null, [sessions.data]);
  const testRoom = testRoomHref(base, { mission: scope.kind === 'mission' ? scope.mission.id : null, session: latestSession?.id ?? null });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['kernel', generatedProjectId] });
    void queryClient.invalidateQueries({ queryKey: ['quality', generatedProjectId] });
  };
  const run = useMutation({
    mutationFn: async (action: 'validate' | 'revalidate' | 'repair' | 'repairAi' | 'review' | 'release'): Promise<unknown> => {
      const id = String(generatedProjectId);
      if (action === 'validate') return api.validateProject(id);
      if (action === 'revalidate') return api.revalidateProject(id);
      if (action === 'repair') return api.repairProject(id);
      if (action === 'repairAi') return api.repairProjectWithAi(id);
      if (action === 'review') return api.acknowledgeHumanReview(id, reviewPhrase.trim());
      return api.forceRelease(id, releasePhrase.trim());
    },
    onSuccess: () => { setReleasePhrase(''); setReviewPhrase(''); refresh(); },
  });

  if (scope.kind === 'pending') return <Skeleton lines={6} />;
  if (scope.kind === 'unresolved') return <ScopeUnresolved scope={scope} title={t('nav.evidence')} base={base} latestHref={latestHref} />;
  if (!generatedProjectId) {
    if (scope.kind === 'mission') {
      return <ScopeNoProject scope={scope} title={t('nav.evidence')} emptyTitle={t('project.evidence.none')} illustration="evidence" base={base} latestHref={latestHref} />;
    }
    return (
      <PageState title={t('nav.evidence')} kind="empty" stateTitle={t('project.evidence.none')} illustration="evidence">{t('project.evidence.noneBody')}</PageState>
    );
  }

  const kernelData = kernel.data;
  const qualityData = quality.data;
  const chiefData = chief.data ?? null;
  const proofData = proof.data;

  const model = proofModel({
    kernel, quality, chief, proof, sessions,
    words: {
      available: t('proofmap.available'),
      missing: t('proofmap.missing'),
      dimension: (name) => t(`proofmap.dimension.${name as 'scope' | 'requirements' | 'architecture' | 'quality'}`),
    },
  });

  const needsHumanReview = kernelData?.functional_completeness_status === 'NEEDS_HUMAN_REVIEW';

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.evidence')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            <ScopeMission scope={scope} base={base} />
            {kernelData ? <Badge value={kernelData.kernel_phase} family={familyFor(kernelData.kernel_phase)} /> : null}
          </div>
          <h1 className="title">{t('evidence.title')}</h1>
          <p className="lede">{t('evidence.lede')}</p>
        </div>
      </div>

      <ScopeNotice scope={scope} latestHref={latestHref} />

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('proofmap.label')}</h2></div>
        {kernel.isPending ? <Skeleton lines={2} /> : (
          <ProofGraph
            pillars={model.pillars}
            evidence={model.evidence}
            verdict={model.verdict}
            release={model.release}
            fitKey={`proof:${generatedProjectId}:${model.evidence.length}`}
            testRoomHref={latestSession ? testRoom : null}
          />
        )}
        <p className="meta" style={{ marginTop: 10 }}>{t('proofmap.note')}</p>
        <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · gates</Source>
      </section>

      <div className="grid">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('evidence.kernel.title')}</h2>
            {kernelData ? <Badge value={kernelData.state} family={familyFor(kernelData.state)} /> : null}
          </div>
          <div className="panel-body stack">
            {kernel.isPending ? <Skeleton lines={4} /> : null}
            {kernel.isError ? <p className="meta">{t('project.evidence.unreadable')}</p> : null}
            {kernelData ? (
              <>
                <p className="body ink2">{kernelData.reason}</p>
                <Kv
                  pairs={[
                    [t('evidence.kernel.phase'), <Badge key="p" value={kernelData.kernel_phase} family={familyFor(kernelData.kernel_phase)} />],
                    [t('evidence.kernel.completeness'), kernelData.functional_completeness_status
                      ? <Badge key="c" value={kernelData.functional_completeness_status} family={familyFor(kernelData.functional_completeness_status)} />
                      : <span key="c" className="meta">{t('common.notYet')}</span>],
                    [t('evidence.kernel.override'), kernelData.override_active
                      ? <Badge key="o" value="OVERRIDE" family="caution" human={kernelData.override_reason ?? ''} />
                      : t('evidence.kernel.noOverride')],
                    [t('evidence.kernel.humanReview'), kernelData.human_review_acknowledged
                      ? <Badge key="h" value="ACKNOWLEDGED" family="hand" human={kernelData.human_review_reason ?? ''} />
                      : t('evidence.kernel.noHumanReview')],
                    [t('evidence.kernel.generated'), formatWhen(kernelData.generated_at, locale)],
                  ]}
                />
                <div className="list">
                  {kernelData.evidence.map((item) => (
                    <div className="li" key={item.id}>
                      <Signal family={item.available ? 'proof' : 'idle'} label={item.label} />
                      <span className="li-title">{item.label}</span>
                      <span className="meta">{item.available ? t('evidence.kernel.available') : t('evidence.kernel.missing')}</span>
                      <span className="li-sub mono">{item.path ?? item.source}</span>
                    </div>
                  ))}
                </div>
                <Source>GET /api/meta-factory/{'{'}project_id{'}'}/engineering-kernel</Source>
              </>
            ) : null}
          </div>
        </section>
      </div>

      <div className="grid g-3">
        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('evidence.quality.title')}</h2>
            {qualityData ? <Badge value={qualityData.passed ? 'PASSED' : 'BLOCKED'} family={qualityData.passed ? 'proof' : 'fault'} /> : null}
          </div>
          <div className="panel-body stack">
            {quality.isPending ? <Skeleton lines={4} /> : null}
            {quality.isError ? <p className="meta">{t('evidence.quality.unreadable')}</p> : null}
            {qualityData ? (
              <>
                <div className="facts">
                  <div className="fact">
                    <span className="label">{t('evidence.quality.score')}</span>
                    <div className="v num">{qualityData.score}</div>
                  </div>
                  <div className="fact">
                    <span className="label">{t('evidence.quality.counts')}</span>
                    <div className="v num">{qualityData.blocker_count} / {qualityData.warning_count} / {qualityData.info_count}</div>
                  </div>
                  <div className="fact">
                    <span className="label">{t('evidence.quality.built')}</span>
                    <div className="v">{qualityData.built ? t('evidence.quality.builtYes') : t('evidence.quality.builtNo')}</div>
                  </div>
                </div>
                {qualityData.release_override ? <Notice family="caution" title={t('evidence.quality.override')}>{t('evidence.quality.overrideBody')}</Notice> : null}
                <Source>GET /api/meta-factory/{'{'}project_id{'}'}/quality-report</Source>
              </>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('evidence.chief.title')}</h2>
            {chiefData ? <Badge value={chiefData.verdict} family={familyFor(chiefData.verdict)} /> : null}
          </div>
          <div className="panel-body stack">
            {chief.isPending ? <Skeleton lines={3} /> : null}
            {!chief.isPending && !chiefData ? (
              <StateBlock kind="empty" title={t('evidence.chief.none')}>{t('evidence.chief.noneBody')}</StateBlock>
            ) : null}
            {chiefData ? (
              <>
                <p className="body ink2">{chiefData.summary}</p>
                <Kv
                  pairs={[
                    [t('evidence.chief.scope'), <span key="s" className="mono">{chiefData.scope_status}</span>],
                    [t('evidence.chief.requirements'), <span key="r" className="mono">{chiefData.requirements_status}</span>],
                    [t('evidence.chief.architecture'), <span key="a" className="mono">{chiefData.architecture_status}</span>],
                    [t('evidence.chief.quality'), <span key="q" className="mono">{chiefData.quality_status}</span>],
                    [t('evidence.chief.findings'), <span key="f" className="num">{chiefData.findings.length}</span>],
                  ]}
                />
                <Source>GET /api/companies/by-job/{'{'}job_id{'}'}/chief</Source>
              </>
            ) : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2 className="h-sub">{t('evidence.tests.title')}</h2>
            {proofData ? <Badge value={proofData.proven ? 'PROVEN' : 'NOT_PROVEN'} family={proofData.proven ? 'proof' : 'idle'} /> : null}
            <div className="actions">
              {/* The gates behind this proof, drawn as the chain the session recorded. */}
              <HeroLink
                className="btn btn-quiet btn-sm"
                href={`${base}/runtime${scopeQuery(scope)}`}
                hero={(link) => link.closest('.panel')?.querySelector<HTMLElement>('.h-sub')}
              >
                {t('links.openRuntime')}
              </HeroLink>
              {/* The sessions behind this proof, gate by gate. */}
              <HeroLink
                className="btn btn-quiet btn-sm"
                href={testRoom}
                hero={(link) => link.closest('.panel')?.querySelector<HTMLElement>('.h-sub')}
              >
                {t('links.openTestRoom')}
              </HeroLink>
            </div>
          </div>
          <div className="panel-body stack">
            {proof.isPending ? <Skeleton lines={3} /> : null}
            {proof.isError ? <p className="meta">{t('evidence.tests.unreadable')}</p> : null}
            {proofData ? (
              <>
                <p className="body ink2">{proofData.reason}</p>
                <Kv
                  pairs={[
                    [t('evidence.tests.latest'), proofData.latest_status
                      ? <Badge key="l" value={proofData.latest_status} family={familyFor(proofData.latest_status)} />
                      : <span key="l" className="meta">{t('common.notYet')}</span>],
                    [t('evidence.tests.provedAt'), proofData.proved_at ? formatWhen(proofData.proved_at, locale) : '—'],
                    [t('evidence.tests.session'), <span key="s" className="mono">{proofData.passing_session_id ?? proofData.latest_session_id ?? '—'}</span>],
                  ]}
                />
                <Source>GET /api/test-room/{'{'}project_id{'}'}/proof</Source>
              </>
            ) : null}
          </div>
        </section>
      </div>

      {qualityData && qualityData.issues.length > 0 ? (
        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('evidence.issues.title')}</h2>
            <span className="meta">{t('evidence.issues.meta', { count: qualityData.issues.length })}</span>
          </div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>{t('evidence.issues.issue')}</th>
                  <th>{t('evidence.issues.severity')}</th>
                  <th>{t('evidence.issues.file')}</th>
                  <th>{t('evidence.issues.fix')}</th>
                </tr>
              </thead>
              <tbody>
                {qualityData.issues.map((issue) => (
                  <tr key={issue.id}>
                    <td>
                      <strong>{issue.title}</strong>
                      <div className="id">{issue.category} · {issue.root_cause}</div>
                    </td>
                    <td><Badge value={issue.severity} family={SEVERITY[issue.severity] ?? 'unknown'} /></td>
                    <td className="id">{issue.file ?? '—'}</td>
                    <td>
                      {issue.suggested_fix}
                      <div className="id">{issue.auto_fixable ? t('evidence.issues.auto') : t('evidence.issues.manual')} · {issue.fix_status}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="sec">
        <div className="sec-head"><h2 className="h-sec">{t('evidence.actions.title')}</h2></div>
        {run.isError ? <Failure title={t('mission.actionFailed')} error={run.error} /> : null}
        {run.isSuccess ? <Notice family="proof" title={t('evidence.actions.done')} /> : null}
        <div className="btn-row" style={{ marginBottom: 14 }}>
          <button className="btn btn-ghost" type="button" disabled={run.isPending} onClick={() => run.mutate('validate')}>{t('evidence.actions.validate')}</button>
          <button className="btn btn-ghost" type="button" disabled={run.isPending} onClick={() => run.mutate('revalidate')}>{t('evidence.actions.revalidate')}</button>
          <button className="btn btn-ghost" type="button" disabled={run.isPending} onClick={() => run.mutate('repair')}>{t('evidence.actions.repair')}</button>
          <button className="btn btn-ghost" type="button" disabled={run.isPending} onClick={() => run.mutate('repairAi')} title={t('evidence.actions.repairAiHint')}>
            {t('evidence.actions.repairAi')}
          </button>
        </div>
        <p className="meta">{t('evidence.actions.note')}</p>

        <div className="grid g-2" style={{ marginTop: 18 }}>
          {needsHumanReview ? (
            <section className="panel">
              <div className="panel-head"><h2 className="h-sub">{t('evidence.review.title')}</h2></div>
              <div className="panel-body stack">
                <p className="body ink2">{t('evidence.review.body')}</p>
                <label className="field">
                  <span className="field-label">{t('evidence.phrase.label', { phrase: REVIEW_PHRASE })}</span>
                  <input value={reviewPhrase} onChange={(event) => setReviewPhrase(event.target.value)} placeholder={REVIEW_PHRASE} />
                  <span className="hint">{t('evidence.phrase.hint')}</span>
                </label>
                <div className="btn-row">
                  <button className="btn btn-hand" type="button" disabled={run.isPending || reviewPhrase.trim() !== REVIEW_PHRASE} onClick={() => run.mutate('review')}>
                    {t('evidence.review.action')}
                  </button>
                </div>
                <Source>POST /api/meta-factory/{'{'}project_id{'}'}/acknowledge-human-review</Source>
              </div>
            </section>
          ) : null}

          {qualityData && !qualityData.can_release ? (
            <section className="panel">
              <div className="panel-head"><h2 className="h-sub">{t('evidence.release.title')}</h2></div>
              <div className="panel-body stack">
                <p className="body ink2">{t('evidence.release.body')}</p>
                <label className="field">
                  <span className="field-label">{t('evidence.phrase.label', { phrase: RELEASE_PHRASE })}</span>
                  <input value={releasePhrase} onChange={(event) => setReleasePhrase(event.target.value)} placeholder={RELEASE_PHRASE} />
                  <span className="hint">{t('evidence.phrase.hint')}</span>
                </label>
                <div className="btn-row">
                  <button className="btn btn-danger" type="button" disabled={run.isPending || releasePhrase.trim() !== RELEASE_PHRASE} onClick={() => run.mutate('release')}>
                    {t('evidence.release.action')}
                  </button>
                </div>
                <Source>POST /api/meta-factory/{'{'}project_id{'}'}/force-release</Source>
              </div>
            </section>
          ) : null}
        </div>
      </section>
    </>
  );
}
