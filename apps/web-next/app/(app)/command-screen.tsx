'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { HeroLink } from '@/components/hero-link';
import { MissionLine } from '@/components/mission-line';
import { Signal } from '@/components/signal';
import { Badge, Kv, Live, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { formatCount, formatTime, formatUsd, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { useStatusLabel } from '@/lib/i18n/status-label';
import { currentAppUrl } from '@/lib/routes';
import { rememberedWorkspace } from '@/lib/session/session';
import { familyFor, isRunning } from '@/lib/status';
import type { Decision } from '@/lib/work/decisions';
import { projectLine } from '@/lib/work/mission-line';
import type { ProjectRow } from '@/lib/work/projects';
import { useWork } from '@/lib/work/use-work';

/**
 * The Command Center answers one question first — does anything need me? — and then shows where everything is:
 * one mission line per project, the queue of decisions beside it, and the few numbers the platform can prove.
 */
export function CommandScreen() {
  const { t, locale } = useI18n();
  const say = useStatusLabel();
  const { jobs, decisions, projects, unreadable, pending } = useWork();
  const llm = useQuery({ queryKey: ['llm-active'], queryFn: api.llmActive });
  const usage = useQuery({ queryKey: ['llm-usage'], queryFn: api.llmUsage });
  const workspaces = useQuery({ queryKey: ['workspaces'], queryFn: api.workspaces });
  const [rememberedId, setRememberedId] = useState<string | null>(null);
  useEffect(() => setRememberedId(rememberedWorkspace()), []);
  const workspace = workspaces.data?.find((entry) => entry.workspace_id === rememberedId) ?? workspaces.data?.[0];

  const live = (jobs.data ?? []).filter((job) => !job.archived);
  const runningAll = live.filter((job) => isRunning(job.status));
  const running = runningAll[0];
  const finished = live
    .filter((job) => job.finishedAt)
    .sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt)))
    .slice(0, 4);

  /* A project's stored name can be cut mid-word (older rooms took the first 60 characters of the idea), so it is shown
     as a name on its own line, never as the subject of the headline sentence. */
  const headline = running
    ? runningAll.length > 1 ? t('command.headline.runningMany', { count: runningAll.length }) : t('command.headline.running')
    : decisions.length > 0
      ? t('command.headline.waiting', { count: decisions.length })
      : t('command.headline.idle');
  const lede = running
    ? t('command.lede.running', { stage: say(running.currentStage) })
    : decisions.length > 0
      ? t('command.lede.waiting')
      : t('command.lede.idle');

  const decisionFor = (row: ProjectRow): Decision | undefined => decisions.find((decision) => decision.href.startsWith(`/p/${encodeURIComponent(row.key)}/`));

  return (
    <div className="cc">
      <header className="cc-head page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('command.eyebrow')}</span>
            {workspace ? <span className="chip">{t('command.workspace', { name: workspace.name })}</span> : null}
            <Live state="snapshot">{t('command.snapshot', { time: formatTime(jobs.dataUpdatedAt, locale) })}</Live>
          </div>
          <h1 className="display cc-situation">{headline}</h1>
          {running ? (
            <p className="cc-project">
              <span className="label">{t('nav.project')}</span>
              <HeroLink className="cc-project-name" href={`/p/${encodeURIComponent(running.projectId)}/missions/${encodeURIComponent(running.id)}`}>
                {running.projectName}
              </HeroLink>
            </p>
          ) : null}
          <p className="lede">{lede}</p>
        </div>
        <div className="btn-row">
          {running ? (
            <Link className="btn btn-primary" href={`/p/${encodeURIComponent(running.projectId)}/missions/${encodeURIComponent(running.id)}`}>
              {t('command.openMission')}
            </Link>
          ) : null}
          <Link className="btn btn-ghost" href="/new">{t('command.startWork')}</Link>
        </div>
      </header>

      {unreadable.length > 0 ? <p className="meta cc-full">{t('command.unreadable', { sources: unreadable.join(' · ') })}</p> : null}

      <section className="cc-board cc-card" aria-labelledby="cc-board-title">
        <div className="panel-head">
          <h2 className="h-sub" id="cc-board-title">{t('command.board.title')}</h2>
          <span className="meta">{t('command.board.meta')}</span>
          <div className="actions"><Link className="btn btn-quiet btn-sm" href="/projects">{t('command.projects.all')}</Link></div>
        </div>
        {pending ? <div className="panel-body"><Skeleton lines={4} /></div> : null}
        {!pending && projects.length === 0 ? (
          <div className="panel-body"><StateBlock kind="empty" title={t('projects.empty')}>{t('projects.emptyBody')}</StateBlock></div>
        ) : null}
        {projects.length > 0 ? (
          <div className="mboard" role="list" aria-label={t('command.board.title')}>
            <div className="mboard-row is-header" aria-hidden="true">
              <span>{t('command.board.col.project')}</span>
              <span>{t('command.board.col.line')}</span>
              <span>{t('command.board.col.state')}</span>
              <span>{t('command.board.col.next')}</span>
            </div>
            {projects.slice(0, 6).map((row) => {
              const next = decisionFor(row);
              return (
                <div className="mboard-row" role="listitem" key={row.key}>
                  <span className="mboard-name">
                    <HeroLink href={`/p/${encodeURIComponent(row.key)}`}><b>{row.name}</b></HeroLink>
                    <span className="id dev-only">{row.key}</span>
                  </span>
                  <span className="mboard-line"><MissionLine points={projectLine(row.room, row.latest)} label={row.name} /></span>
                  <span className="mboard-state">
                    <Badge value={row.state} family={familyFor(row.state)} live={isRunning(row.state)} />
                    <span className="meta">{t('command.board.missions', { count: row.missions })} · {formatWhen(row.at, locale)}</span>
                  </span>
                  {next ? (
                    <Link className="mboard-next is-hand" href={next.href}>
                      <Signal family="hand" />
                      <span>{t('command.board.decide', { state: say(next.state) })}</span>
                    </Link>
                  ) : (
                    <span className="mboard-next"><Signal family="idle" /><span>{t('command.board.nothing')}</span></span>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        <div className="panel-body cc-note">
          <p className="meta">{t('command.board.tail')}</p>
          <Source>GET /api/project-rooms · GET /api/meta-factory/jobs · GET /api/projects</Source>
        </div>
      </section>

      <aside className="cc-queue" aria-labelledby="cc-queue-title">
        <div className="row-between">
          <h2 className="h-sub" id="cc-queue-title">{t('command.waiting.title')}</h2>
          <Link className="btn btn-quiet btn-sm" href="/inbox">{t('command.waiting.open')}</Link>
        </div>
        {pending ? <Skeleton lines={4} /> : null}
        {!pending && decisions.length === 0 ? (
          <StateBlock kind="empty" title={t('command.waiting.none')}>{t('command.waiting.noneBody')}</StateBlock>
        ) : null}
        {decisions.slice(0, 5).map((decision) => (
          <QueueItem key={decision.id} decision={decision} />
        ))}
        {decisions.length > 5 ? <p className="meta">{t('command.waiting.more', { count: decisions.length - 5 })}</p> : null}
      </aside>

      <section className="cc-live" aria-labelledby="cc-live-title">
        <div className="sec-head">
          <h2 className="h-sub" id="cc-live-title">{t('command.mission.title')}</h2>
          {running ? <Badge value={running.status} family={familyFor(running.status)} live /> : null}
        </div>
        {jobs.isPending ? <Skeleton lines={3} /> : null}
        {!jobs.isPending && running ? (
          <div className="panel">
            <div className="panel-body stack">
              <div className="row" style={{ gap: 10 }}>
                <strong>{running.projectName}</strong>
                <span className="src">{running.id}</span>
              </div>
              <div className="meter" aria-hidden="true"><span style={{ width: `${Math.max(0, Math.min(100, running.progress))}%` }} /></div>
              <Kv
                pairs={[
                  [t('command.mission.stage'), <span key="stage">{say(running.currentStage)}<span className="src">{running.currentStage}</span></span>],
                  [t('command.mission.progress'), `${running.progress}%`],
                  [t('command.mission.started'), formatWhen(running.startedAt, locale)],
                  [t('command.mission.provider'), running.providerLabel || '—'],
                ]}
              />
              <Source>GET /api/meta-factory/jobs · status, currentStage, progress</Source>
            </div>
          </div>
        ) : null}
        {!jobs.isPending && !running ? <StateBlock kind="empty" title={t('command.mission.none')}>{t('command.mission.noneBody')}</StateBlock> : null}
      </section>

      <section className="cc-proof cc-card" aria-labelledby="cc-proof-title">
        <div className="panel-head"><h2 className="h-sub" id="cc-proof-title">{t('command.evidence.title')}</h2></div>
        <div className="panel-body">
          {finished.length === 0 ? (
            <p className="meta">{t('command.evidence.none')}</p>
          ) : (
            <ol className="mini-tl">
              {finished.map((job) => (
                <li key={job.id}>
                  <span className="mono num">{formatTime(job.finishedAt ? Date.parse(job.finishedAt) : 0, locale)}</span>
                  <Signal family={familyFor(job.status)} label={job.status} />
                  <span className="grow">
                    <b>{job.status === 'READY' ? t('command.evidence.ready') : t('command.evidence.failed', { stage: say(job.currentStage) })}</b>
                    <span className="meta">{job.projectName} · {t('command.evidence.build', { status: job.buildStatus })}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          <Source>GET /api/meta-factory/jobs · finishedAt, buildStatus</Source>
        </div>
      </section>

      <section className="cc-provider cc-card" aria-labelledby="cc-provider-title">
        <div className="panel-head">
          <h2 className="h-sub" id="cc-provider-title">{t('command.provider.title')}</h2>
          <div className="actions"><Link className="btn btn-quiet btn-sm" href="/settings/ai">{t('command.provider.details')}</Link></div>
        </div>
        <div className="panel-body stack">
          {llm.isPending ? <Skeleton lines={2} /> : null}
          {llm.data && llm.data.hasKey ? (
            <div className="row" style={{ gap: 8 }}>
              <Badge value={llm.data.status} family={familyFor(llm.data.status)} />
              <strong>{llm.data.providerLabel ?? llm.data.provider ?? '—'}</strong>
              <span className="mono muted">{llm.data.model ?? ''}</span>
              {llm.data.validationIsStale ? (
                <Badge value="STALE" family="caution" human={t('command.provider.stale', { days: llm.data.validationAgeDays ?? 0 })} />
              ) : null}
            </div>
          ) : null}
          {llm.data && !llm.data.hasKey ? <StateBlock kind="empty" title={t('command.provider.none')}>{t('command.provider.noneBody')}</StateBlock> : null}
          {usage.data ? (
            <>
              <div className="metrics">
                <div className="metric">
                  <span className="metric-value num">{formatCount(usage.data.requests, locale)}</span>
                  <span className="metric-label">{t('command.provider.requests')}</span>
                </div>
                <div className="metric">
                  <span className="metric-value num">{formatUsd(usage.data.estimated_cost_usd, locale)}</span>
                  <span className="metric-label">{t('command.provider.cost')}</span>
                </div>
                <div className="metric is-wide">
                  <span className="metric-value num">{formatCount(usage.data.input_tokens, locale)}<small> / {formatCount(usage.data.output_tokens, locale)}</small></span>
                  <span className="metric-label">{t('command.provider.tokens')}</span>
                </div>
              </div>
              <p className="meta">{t('command.provider.window', { hours: usage.data.window_hours })} · {t('command.provider.costNote')}</p>
            </>
          ) : null}
          <Source>GET /api/llm/settings/active · GET /api/llm/usage/stats</Source>
        </div>
      </section>
    </div>
  );
}

/** One decision in the queue: what waits, on which project, since when — and the screen that takes it. */
function QueueItem({ decision }: { readonly decision: Decision }) {
  const { t, tDynamic, locale } = useI18n();
  const say = useStatusLabel();
  const title = tDynamic(`inbox.rule.${decision.rule}`, { project: decision.project });
  const body = (
    <>
      <span className="qitem-seal"><Signal family="hand" label={title} /></span>
      <span className="grow">
        <span className="qitem-top">
          <span className="label">{t(`inbox.filter.${decision.kind}`)}</span>
          <span className="meta num">{formatWhen(decision.at, locale)}</span>
        </span>
        <span className="qitem-title">{title}</span>
        <span className="meta">{say(decision.state)}<span className="src">{decision.state}</span></span>
      </span>
    </>
  );
  return decision.href
    ? <HeroLink className="qitem" href={decision.href} hero={(link) => link.querySelector<HTMLElement>('.qitem-title')}>{body}</HeroLink>
    : <a className="qitem" href={currentAppUrl(decision.current)}>{body}</a>;
}
