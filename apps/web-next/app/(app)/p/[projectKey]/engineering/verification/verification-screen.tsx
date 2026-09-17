'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EvidenceLine } from '@/components/evidence-line';
import { HeroLink } from '@/components/hero-link';
import { Signal } from '@/components/signal';
import { Badge, Kv, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { testRoomHref } from '@/lib/evidence/test-room';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useProject } from '@/lib/project/use-project';
import { GATE_FAMILY } from '@/lib/runtime/runtime-chain';
import { familyFor } from '@/lib/status';

export function VerificationScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const { generatedProjectId } = project;
  const base = `/p/${encodeURIComponent(projectKey)}`;
  const queryClient = useQueryClient();

  const profile = useQuery({
    queryKey: ['test-profile', generatedProjectId],
    queryFn: () => api.testProfile(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
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
  const run = useMutation({
    mutationFn: () => api.runTests(String(generatedProjectId)),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['test-sessions', generatedProjectId] });
      void queryClient.invalidateQueries({ queryKey: ['test-room-proof', generatedProjectId] });
    },
  });

  if (!generatedProjectId) {
    return (
      <PageState title={t('nav.verification')} kind="empty" stateTitle={t('verification.none')} illustration="evidence">
        {t('verification.noneBody')}
      </PageState>
    );
  }

  const unsupported = profile.data?.status === 'unsupported';

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.verification')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            {proof.data ? <Badge value={proof.data.proven ? 'PROVEN' : 'NOT_PROVEN'} family={proof.data.proven ? 'proof' : 'idle'} /> : null}
          </div>
          <h1 className="title">{t('verification.title')}</h1>
          <p className="lede">{t('verification.lede')}</p>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="button" disabled={run.isPending || unsupported} onClick={() => run.mutate()}>
            {run.isPending ? t('verification.running') : t('verification.run')}
          </button>
        </div>
      </div>

      {run.isError ? <Notice family="fault" title={t('verification.failed')}>{String(run.error)}</Notice> : null}
      {unsupported ? <Notice family="caution" title={t('verification.unsupported')}>{profile.data?.reason ?? ''}</Notice> : null}

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('verification.profile.title')}</h2></div>
          {profile.isPending ? <Skeleton lines={3} /> : null}
          {profile.isError ? <p className="meta">{t('verification.profile.unreadable')}</p> : null}
          {profile.data ? (
            <>
              <Kv
                pairs={[
                  [t('verification.profile.status'), <Badge key="s" value={profile.data.status} family={familyFor(profile.data.status)} />],
                  [t('verification.profile.matched'), <span key="m" className="mono">{profile.data.profile?.id ?? '—'}</span>],
                  [t('verification.profile.reason'), profile.data.reason],
                ]}
              />
              <Source>GET /api/test-room/{'{'}project_id{'}'}/profile</Source>
            </>
          ) : null}
        </section>

        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('verification.proof.title')}</h2></div>
          {proof.isPending ? <Skeleton lines={3} /> : null}
          {proof.data ? (
            <>
              <p className="body ink2">{proof.data.reason}</p>
              <Kv
                pairs={[
                  [t('evidence.tests.latest'), proof.data.latest_status
                    ? <Badge key="l" value={proof.data.latest_status} family={familyFor(proof.data.latest_status)} />
                    : <span key="l" className="meta">{t('common.notYet')}</span>],
                  [t('evidence.tests.provedAt'), proof.data.proved_at ? formatWhen(proof.data.proved_at, locale) : '—'],
                ]}
              />
              <Source>GET /api/test-room/{'{'}project_id{'}'}/proof</Source>
            </>
          ) : null}
        </section>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('verification.sessions.title')}</h2>
          <span className="meta">{t('verification.sessions.meta', { count: sessions.data?.length ?? 0 })}</span>
        </div>
        {sessions.isPending ? <Skeleton lines={4} /> : null}
        {sessions.data && sessions.data.length === 0 ? (
          <StateBlock kind="empty" title={t('verification.sessions.none')}>{t('verification.sessions.noneBody')}</StateBlock>
        ) : null}
        <div className="stack">
          {(sessions.data ?? []).map((session) => (
            <section className="panel" key={session.id}>
              <div className="panel-head">
                <h3 className="h-sub mono">{session.id}</h3>
                <Badge value={session.status} family={familyFor(session.status)} />
                <span className="meta">{formatWhen(session.started_at, locale)}</span>
                <div className="actions">
                  <HeroLink
                    className="btn btn-quiet btn-sm"
                    href={testRoomHref(base, { session: session.id })}
                    hero={(link) => link.closest('.panel')?.querySelector<HTMLElement>('.h-sub')}
                  >
                    {t('links.openInTestRoom')}
                  </HeroLink>
                </div>
              </div>
              <div className="panel-body stack">
                {(session.gates ?? []).length > 0 ? (
                  <EvidenceLine
                    label={t('verification.gates.label', { session: session.id })}
                    stations={(session.gates ?? []).map((gate) => ({
                      id: gate.gate, name: gate.label || gate.gate, state: gate.status, family: GATE_FAMILY[gate.status] ?? familyFor(gate.status),
                    }))}
                  />
                ) : null}
                <div className="list">
                  {(session.gates ?? []).map((gate) => (
                    <div className="li" key={gate.gate}>
                      <Signal family={GATE_FAMILY[gate.status] ?? familyFor(gate.status)} label={gate.gate} />
                      <span className="li-title">{gate.label || gate.gate}</span>
                      <span className="meta mono">{gate.status}</span>
                      <span className="li-sub">
                        {gate.reason}
                        {gate.blockers.length > 0 ? ` · ${t('verification.gate.blockers', { count: gate.blockers.length })}` : ''}
                        {gate.evidence.length > 0 ? ` · ${t('verification.gate.evidence', { count: gate.evidence.length })}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          ))}
        </div>
        <p className="meta" style={{ marginTop: 10 }}>{t('verification.sessions.note')}</p>
        <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · POST …/run</Source>
      </section>
    </>
  );
}
