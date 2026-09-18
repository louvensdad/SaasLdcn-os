'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Icon, Signal, type Family } from '@/components/signal';
import { Badge, GapChip, Kv, Skeleton, Source, StateBlock } from '@/components/ui';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import { guidesFor } from '@/lib/learn/content';
import { deriveFirstSteps, type FirstStep } from '@/lib/learn/first-steps';
import { useLearnPrefs } from '@/lib/learn/prefs';
import { AREAS } from '@/lib/learn/types';
import { currentAppUrl } from '@/lib/routes';
import { useSession } from '@/lib/session/session';

/** The six rows the briefing decides from; SPEC_READY and GENERATED are not ProjectRoomStatus values (gap G17). */
const NEXT_MOVE_TABLE = [
  ['DRAFT', 'describe_intent'],
  ['SPEC_READY', 'review_architecture'],
  ['BLUEPRINT_READY', 'run_engineering_review'],
  ['ENGINEERING_REVIEW', 'resolve_review'],
  ['ENGINEERING_APPROVED', 'generate'],
  ['GENERATED', 'verify_in_test_room'],
] as const;
const ROOM_STATUSES = new Set(['DRAFT', 'SPEC_GENERATING', 'UNDER_REVIEW', 'PROMPT_READY', 'PROMPT_APPROVED', 'BLUEPRINT_GENERATING', 'BLUEPRINT_READY', 'ENGINEERING_REVIEW', 'ENGINEERING_APPROVED', 'WAITING_META_FACTORY', 'META_FACTORY_RUNNING', 'GENERATING', 'VALIDATING', 'READY', 'FAILED', 'ARCHIVED']);

const CATEGORIES = ['create', 'analyze', 'fix', 'evolve', 'plan', 'research'] as const;

export function LearnScreen() {
  const { t, tDynamic, locale } = useI18n();
  const { state } = useSession();
  const user = state.status === 'signed-in' ? state.user : null;

  const rooms = useQuery({ queryKey: ['project-rooms'], queryFn: api.projectRooms });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: api.jobs });
  const previews = useQuery({ queryKey: ['activity', 'preview'], queryFn: () => api.activity({ category: 'preview' }) });
  const registry = useQuery({ queryKey: ['mission-registry'], queryFn: api.missionRegistry });
  const { prefs, setFirstSteps, saveFailed } = useLearnPrefs();

  const latestRoom = useMemo(() => (rooms.data ? [...rooms.data].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] : undefined), [rooms.data]);
  const briefing = useQuery({ queryKey: ['briefing', latestRoom?.room_id ?? ''], queryFn: () => api.briefing(latestRoom?.room_id), enabled: rooms.isSuccess });

  const [hiddenOverride, setHiddenOverride] = useState<boolean | null>(null);
  const [filter, setFilter] = useState('');

  const settled = !rooms.isPending && !jobs.isPending && !previews.isPending;
  const steps: readonly FirstStep[] = user && settled
    ? deriveFirstSteps({
      user,
      rooms: rooms.isError ? null : rooms.data,
      jobs: jobs.isError ? null : jobs.data,
      previews: previews.isError ? null : previews.data,
    })
    : [];
  const done = steps.filter((step) => step.state === 'done').length;
  const current = steps.find((step) => step.state === 'pending');
  const hidden = hiddenOverride ?? prefs.firstSteps === 'hidden';
  const toggle = (next: boolean) => {
    setHiddenOverride(next);
    setFirstSteps(next ? 'hidden' : 'visible');
  };

  const when = (value: string | null) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  };

  const stepRow = (step: FirstStep, index: number) => {
    const family: Family = step.state === 'done' ? 'proof' : step.state === 'unknown' ? 'unknown' : step === current ? 'hand' : 'idle';
    const title = tDynamic(`step.${step.id}.title`);
    return (
      <div className="li" key={step.id} data-read={step.id === 'signin' ? 'session' : undefined}>
        <Signal family={family} label={title} />
        <span className="li-title">{index + 1}. {title}</span>
        <span className="row" style={{ gap: 8 }}>
          {step.at ? <span className="meta num">{when(step.at)}</span> : <span className="meta">{step.state === 'done' ? '' : t('common.notYet')}</span>}
          {step === current ? (
            <Link className="btn btn-primary btn-sm" href={step.href}>{t('learn.first.doNow')}</Link>
          ) : null}
        </span>
        <span className="li-sub">
          {step.state === 'done' ? tDynamic(`step.${step.id}.fact`, step.vars) : step.state === 'unknown' ? t('learn.first.unreadable') : t('learn.first.pending')}{' '}
          <Source>{step.source}</Source>
          {step.id === 'start' ? <><br /><span className="meta">{t('step.start.note')}</span></> : null}
        </span>
      </div>
    );
  };

  const firstSteps = hidden ? (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h-sub">{t('learn.first.title')}</h2>
        <span className="meta">{t('learn.first.hiddenMeta', { done, total: steps.length || 8 })}</span>
      </div>
      <div className="panel-body stack">
        <p className="body ink2">{t('learn.first.hidden')}</p>
        <div className="btn-row"><button className="btn btn-ghost btn-sm" type="button" onClick={() => toggle(false)}>{t('learn.first.show')}</button></div>
        {saveFailed ? <p className="meta">{t('learn.first.saveFailed')}</p> : null}
      </div>
    </section>
  ) : (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h-sub">{t('learn.first.title')}</h2>
        <span className="meta num">{t('learn.first.count', { done, total: steps.length || 8 })}</span>
      </div>
      <div className="panel-body stack">
        {settled ? (
          <>
            <div className="meter" role="img" aria-label={t('learn.first.progress', { done, total: steps.length })}>
              <span style={{ width: `${steps.length ? Math.round((done / steps.length) * 100) : 0}%` }} />
            </div>
            <div className="list">{steps.map(stepRow)}</div>
            <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
              <span className="meta">{t('learn.first.rule')}</span>
              <button className="btn btn-quiet btn-sm" type="button" onClick={() => toggle(true)}>{t('learn.first.hide')}</button>
            </div>
            {saveFailed ? <p className="meta">{t('learn.first.saveFailed')}</p> : null}
            <Source>GET /api/project-rooms · GET /api/meta-factory/jobs · GET /api/activity-feed?category=preview</Source>
          </>
        ) : (
          <Skeleton lines={5} />
        )}
      </div>
    </section>
  );

  const move = briefing.data?.next_move ?? null;
  const nextMove = (
    <section className="panel">
      <div className="panel-head">
        <h2 className="h-sub">{t('learn.next.title')}</h2>
        <span className="meta">{latestRoom?.title ?? t('learn.next.none')}</span>
      </div>
      <div className="panel-body stack">
        {briefing.isPending ? <Skeleton lines={3} /> : null}
        {briefing.isError ? <StateBlock kind="unknown" title={t('learn.next.error')} /> : null}
        {briefing.data ? (
          <>
            {briefing.data.readings.length > 0 ? (
              <Kv
                pairs={briefing.data.readings.map((reading) => [
                  tDynamic(`briefing.${reading.label}`),
                  <span key={reading.label}>
                    {reading.source === 'room_status' ? <Badge value={reading.value} family="pulse" /> : reading.value}{' '}
                    <span className="meta">{tDynamic(`briefing.source.${reading.source}`)}</span>
                  </span>,
                ])}
              />
            ) : (
              <p className="meta">{t('learn.next.noReadings')}</p>
            )}
            {move && move.action ? (
              <div className="stack" style={{ gap: 8 }}>
                <p className="body">{tDynamic(`briefing.${move.reason}`)}</p>
                <div className="btn-row">
                  <a className="btn btn-primary ext-mark" href={currentAppUrl(move.href || '/platform')}>{tDynamic(`briefing.action.${move.action}`)} <Icon name="external" /></a>
                </div>
                <p className="meta">{t('learn.next.currentApp', { href: move.href || '—' })}</p>
              </div>
            ) : (
              <StateBlock kind="unknown" title={tDynamic(`briefing.${move?.reason ?? 'assistant.next.unknown_state'}`)}>
                {t('learn.next.unknown', { project: latestRoom?.title ?? '—', status: move?.blocked_by || briefing.data.state || '—' })}{' '}
                <GapChip id="G17" detail="The briefing next-move table covers 4 of 16 ProjectRoomStatus values" />
              </StateBlock>
            )}
            <details>
              <summary className="meta" style={{ cursor: 'pointer' }}>{t('learn.next.how')}</summary>
              <div className="tbl-wrap" style={{ marginTop: 8 }}>
                <table style={{ width: '100%' }}>
                  <thead><tr><th>{t('learn.next.colStatus')}</th><th>{t('learn.next.colAction')}</th></tr></thead>
                  <tbody>
                    {NEXT_MOVE_TABLE.map(([status, action]) => (
                      <tr key={status}>
                        <td className="mono">{status}{ROOM_STATUSES.has(status) ? '' : <span className="meta"> {t('learn.next.notRoomStatus')}</span>}</td>
                        <td>{tDynamic(`briefing.action.${action}`)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="meta">{t('learn.next.otherwise')}</p>
            </details>
          </>
        ) : null}
        <Source>GET /api/ldcn/briefing{latestRoom ? '?project_id=…' : ''}</Source>
      </div>
    </section>
  );

  const { guides, native } = guidesFor(locale);
  const needle = filter.trim().toLowerCase();
  const matches = (guide: (typeof guides)[number]) =>
    !needle || `${guide.title} ${guide.summary} ${guide.screens.map((screen) => screen.label).join(' ')} ${(guide.terms ?? []).join(' ')}`.toLowerCase().includes(needle);
  const visible = guides.filter(matches);

  return (
    <>
      <div className="page-head">
        <div className="grow">
          <div className="eyebrow">
            <span className="label">{t('learn.eyebrow', { workspace: user?.full_name.split(/\s+/)[0] ?? '' })}</span>
            {settled ? <Badge value={t('learn.first.count', { done, total: steps.length })} family={done === steps.length ? 'proof' : 'hand'} human={t('learn.first.completed')} /> : null}
          </div>
          <h1 className="title">{t('learn.title')}</h1>
          <p className="lede">{t('learn.lede')}</p>
        </div>
        <div className="btn-row"><Link className="btn btn-ghost" href="/learn/terms">{t('learn.terms')}</Link></div>
      </div>

      <div className="grid g-main-side">
        {firstSteps}
        <div className="stack-lg">
          {nextMove}
          <section className="panel">
            <div className="panel-head"><h2 className="h-sub">{t('learn.help.title')}</h2></div>
            <div className="panel-body">
              <div className="list">
                <div className="li"><Icon name="learn" className="sig" /><span className="li-title">{t('learn.help.button.title')}</span><span className="li-sub">{t('learn.help.button.body')}</span></div>
                <div className="li"><span className="kbd">?</span><span className="li-title">{t('learn.help.key.title')}</span><span className="li-sub">{t('learn.help.key.body')}</span></div>
                <div className="li"><Icon name="search" className="sig" /><span className="li-title">{t('learn.help.palette.title')}</span><span className="li-sub">{t('learn.help.palette.body')}</span></div>
              </div>
            </div>
          </section>
        </div>
      </div>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('learn.guides.title')}</h2>
          <span className="meta">{t('learn.guides.count', { count: guides.length, read: prefs.readGuides.length })}</span>
          <div className="actions">
            <div className="field" style={{ minWidth: 'min(260px, 100%)' }}>
              <label className="sr-only" htmlFor="guide-filter">{t('learn.guides.filter')}</label>
              <input id="guide-filter" type="search" placeholder={t('learn.guides.filter')} value={filter} onChange={(event) => setFilter(event.target.value)} />
            </div>
          </div>
        </div>
        {!native ? <p className="meta">{t('learn.guides.languageNote')}</p> : null}
        {AREAS.map((area) => {
          const items = visible.filter((guide) => guide.area === area);
          if (items.length === 0) return null;
          return (
            <div key={area}>
              <h3 className="label" style={{ margin: '18px 0 4px' }}>{t(`area.${area}`)}</h3>
              <div className="intents">
                {items.map((guide) => (
                  <Link className="intent" key={guide.id} href={`/learn/${guide.id}`}>
                    <Icon name="learn" />
                    <span className="intent-title">{guide.title}</span>
                    <span className="meta">{prefs.readGuides.includes(guide.id) ? t('learn.guides.read') : ''}</span>
                    <span className="intent-sub">{guide.summary}</span>
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
        {visible.length === 0 ? <p className="meta">{t('learn.guides.empty')}</p> : null}
      </section>

      <section className="sec">
        <div className="sec-head">
          <h2 className="h-sec">{t('learn.practice.title')}</h2>
          <span className="meta">{t('learn.practice.meta', { count: registry.data?.length ?? 24 })}</span>
          <div className="actions">
            <Link className="btn btn-ghost btn-sm" href="/new">{t('learn.practice.start')}</Link>
          </div>
        </div>
        {registry.isPending ? <Skeleton lines={3} /> : null}
        {registry.isError ? <StateBlock kind="unknown" title={t('learn.practice.error')} /> : null}
        {registry.data ? (
          <div className="list">
            {CATEGORIES.map((category) => {
              const types = registry.data.filter((mission) => mission.category === category);
              if (types.length === 0) return null;
              return (
                <div className="li" key={category}>
                  <Icon name="workforce" className="sig" />
                  <span className="li-title">{t(`mission.category.${category}`)}</span>
                  <span className="meta num">{types.length}</span>
                  <span className="li-sub">{types.map((mission) => <span className="chip" key={mission.id} title={mission.id}>{mission.title}</span>)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
        <p className="meta" style={{ marginTop: 8 }}>{t('learn.practice.note')} <GapChip id="G18" detail="Mission registry titles and glossary definitions are Portuguese-only" /></p>
        <Source>GET /api/missions/registry</Source>
      </section>
    </>
  );
}
