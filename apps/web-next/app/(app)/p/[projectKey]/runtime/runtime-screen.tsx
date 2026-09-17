'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';

import { RuntimeChain } from '@/components/drawings/runtime-chain';
import { HeroLink } from '@/components/hero-link';
import { ScopeMission, ScopeNoProject, ScopeNotice, ScopeUnresolved } from '@/components/mission-scope';
import { Icon, Signal } from '@/components/signal';
import { Badge, Kv, Notice, PageState, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { ApiError } from '@/lib/api/http';
import { testRoomHref } from '@/lib/evidence/test-room';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { missionScope, scopedProjectId, scopeQuery } from '@/lib/project/mission-scope';
import { useProject } from '@/lib/project/use-project';
import { familyFor } from '@/lib/status';

export function RuntimeScreen({ projectKey }: { readonly projectKey: string }) {
  const { t, locale } = useI18n();
  const project = useProject(projectKey);
  const search = useSearchParams();
  /* Which generated project this screen reads: the latest mission's, or the one a linked mission generated. */
  const scope = missionScope(project, search.get('mission'));
  const generatedProjectId = scopedProjectId(scope);
  const base = `/p/${encodeURIComponent(projectKey)}`;
  const latestHref = `${base}/runtime`;
  const queryClient = useQueryClient();

  const preview = useQuery({
    queryKey: ['preview', generatedProjectId],
    queryFn: () => api.previewByProject(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const sessions = useQuery({
    queryKey: ['test-sessions', generatedProjectId],
    queryFn: () => api.testSessions(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const sessionId = preview.data?.session_id;
  const logs = useQuery({
    queryKey: ['preview-console', sessionId],
    queryFn: () => api.previewConsole(String(sessionId)),
    enabled: Boolean(sessionId),
    retry: false,
  });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['preview', generatedProjectId] });
  const start = useMutation({ mutationFn: () => api.startPreview(String(generatedProjectId)), onSuccess: invalidate });
  const stop = useMutation({ mutationFn: () => api.stopPreview(String(sessionId)), onSuccess: invalidate });

  if (scope.kind === 'pending') return <Skeleton lines={6} />;
  if (scope.kind === 'unresolved') return <ScopeUnresolved scope={scope} title={t('nav.runtime')} base={base} latestHref={latestHref} />;
  if (!generatedProjectId) {
    if (scope.kind === 'mission') {
      return <ScopeNoProject scope={scope} title={t('nav.runtime')} emptyTitle={t('runtime.none')} illustration="runtime" base={base} latestHref={latestHref} />;
    }
    return (
      <PageState title={t('nav.runtime')} kind="empty" stateTitle={t('runtime.none')} illustration="runtime">
        {t('runtime.noneBody')}
      </PageState>
    );
  }

  const session = preview.data;
  const running = session?.status === 'running';

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('nav.runtime')}</span>
            <span className="chip mono">{generatedProjectId}</span>
            <ScopeMission scope={scope} base={base} />
            {session ? <Badge value={session.status} family={familyFor(session.status)} live={running} /> : null}
          </div>
          <h1 className="title">{t('runtime.title')}</h1>
          <p className="lede">{t('runtime.lede')}</p>
        </div>
        <div className="btn-row">
          {running ? (
            <button className="btn btn-ghost" type="button" disabled={stop.isPending} onClick={() => stop.mutate()}>
              <Icon name="stop" /> {t('runtime.stop')}
            </button>
          ) : (
            <button className="btn btn-primary" type="button" disabled={start.isPending} onClick={() => start.mutate()}>
              <Icon name="play" /> {start.isPending ? t('runtime.starting') : t('runtime.start')}
            </button>
          )}
        </div>
      </div>

      <ScopeNotice scope={scope} latestHref={latestHref} />
      {start.isError ? <Notice family="fault" title={t('runtime.failed')}>{String(start.error)}</Notice> : null}

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('runmap.title')}</h2>
          <span className="meta">{t('runmap.note')}</span>
          <div className="actions">
            {/* What the recorded gates prove, read for the same generated project. */}
            <HeroLink
              className="btn btn-quiet btn-sm"
              href={`${base}/evidence${scopeQuery(scope)}`}
              hero={(link) => link.closest('.sec')?.querySelector<HTMLElement>('.h-sec')}
            >
              {t('links.openEvidence')}
            </HeroLink>
          </div>
        </div>
        <RuntimeChain
          sessions={sessions.data ?? null}
          sessionsRead={sessions.isSuccess}
          preview={preview.data ?? null}
          previewRead={preview.isSuccess || (preview.error instanceof ApiError && preview.error.status === 404)}
          console={logs.data ?? null}
          consoleRead={logs.isSuccess}
          testRoomLink={(session) => testRoomHref(base, { mission: scope.kind === 'mission' ? scope.mission.id : null, session })}
        />
        <Source>GET /api/test-room/{'{'}project_id{'}'}/sessions · GET /api/live-preview/by-project/{'{'}project_id{'}'}</Source>
      </section>

      <div className="grid g-2">
        <section className="sec">
          <div className="sec-head"><h2 className="h-sec">{t('runtime.preview.title')}</h2></div>
          {preview.isPending ? <Skeleton lines={3} /> : null}
          {preview.isError ? <StateBlock kind="empty" title={t('runtime.preview.none')}>{t('runtime.preview.noneBody')}</StateBlock> : null}
          {session ? (
            <>
              <Kv
                pairs={[
                  [t('runtime.preview.status'), <Badge key="s" value={session.status} family={familyFor(session.status)} live={running} />],
                  [t('runtime.preview.reason'), session.reason || '—'],
                  [t('runtime.preview.url'), session.preview_url
                    ? <a key="u" className="ext-mark mono" href={session.preview_url} target="_blank" rel="noreferrer">{session.preview_url} <Icon name="external" /></a>
                    : <span key="u" className="meta">{t('runtime.preview.noUrl')}</span>],
                  [t('runtime.preview.started'), formatWhen(session.started_at, locale)],
                  [t('runtime.preview.activity'), formatWhen(session.last_activity_at, locale)],
                ]}
              />
              <Source>GET /api/live-preview/by-project/{'{'}project_id{'}'}</Source>
            </>
          ) : null}
        </section>

        <section className="sec">
          <div className="sec-head">
            <h2 className="h-sec">{t('runtime.console.title')}</h2>
            <span className="meta">{t('runtime.console.meta', { count: logs.data?.length ?? 0 })}</span>
          </div>
          {!sessionId ? <p className="meta">{t('runtime.console.noSession')}</p> : null}
          {logs.isPending && sessionId ? <Skeleton lines={3} /> : null}
          {logs.data && logs.data.length === 0 ? <p className="meta">{t('runtime.console.empty')}</p> : null}
          {logs.data && logs.data.length > 0 ? (
            <div className="list">
              {logs.data.slice(0, 20).map((entry, index) => (
                <div className="li" key={`${entry.at}-${index}`}>
                  <Signal family={entry.type === 'error' ? 'fault' : entry.type === 'warning' ? 'caution' : 'idle'} label={entry.type} />
                  <span className="li-title mono">{entry.type}</span>
                  <span className="meta nowrap">{formatWhen(entry.at, locale)}</span>
                  <span className="li-sub">{entry.text}</span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="meta" style={{ marginTop: 10 }}>{t('runtime.console.note')}</p>
          <Source>GET /api/live-preview/{'{'}session_id{'}'}/console</Source>
        </section>
      </div>
    </>
  );
}
