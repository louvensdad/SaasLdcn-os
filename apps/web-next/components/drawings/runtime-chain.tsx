'use client';

import type { ConsoleLogEntry, LivePreviewSession } from '@contracts/live-preview.contract';
import type { TestRoomSessionView } from '@contracts/test-room.contract';
import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { HeroLink, useHeroPush } from '@/components/hero-link';
import { Signal } from '@/components/signal';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { layoutRuntimeChain, type ChainNodeData } from '@/lib/runtime/runtime-chain';

import { Inspector } from './inspector';

/** The runtime drawing: the gates and probes of the latest Test Room session, then the live preview and its console. */
export function RuntimeChain({ sessions, sessionsRead, preview, previewRead, console: entries, consoleRead, testRoomLink }: {
  readonly sessions: readonly TestRoomSessionView[] | null;
  readonly sessionsRead: boolean;
  readonly preview: LivePreviewSession | null;
  readonly previewRead: boolean;
  readonly console: readonly ConsoleLogEntry[] | null;
  readonly consoleRead: boolean;
  /** The Test Room page of a session, where its gates are read down to each piece of evidence. */
  readonly testRoomLink?: (sessionId: string) => string;
}) {
  const { t, locale } = useI18n();
  const push = useHeroPush();
  const [selected, setSelected] = useState<string | null>(null);
  const session = useMemo(() => [...(sessions ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at))[0] ?? null, [sessions]);

  const { nodes, edges } = useMemo(() => layoutRuntimeChain({
    session, sessionRead: sessionsRead, preview, previewRead, console: entries, consoleRead,
    labels: {
      gate: (gate) => `${gate.label}: ${gate.status}`,
      probe: (evidence) => `${evidence.label}: ${evidence.status}`,
      preview: (state) => `${t('runmap.preview')}: ${state}`,
      console: (errors) => `${t('runmap.console')}: ${t('runmap.errors', { count: errors })}`,
      noSession: t('runmap.noSession'),
    },
  }), [consoleRead, entries, preview, previewRead, session, sessionsRead, t]);

  const render = (node: GraphNode<ChainNodeData>) => {
    const data = node.data;
    switch (data.kind) {
      case 'lane':
        return (
          <div className="band">
            <span className="label">
              {data.lane === 'session'
                ? (data.session ? t('runmap.lane.session', { status: data.session.status, when: formatWhen(data.session.started_at, locale) }) : t('runmap.lane.sessionNone'))
                : t('runmap.lane.preview')}
            </span>
          </div>
        );
      case 'gap':
        return (
          <div className="svc-card f-na">
            <span className="svc-glyph"><Signal family="na" /></span>
            <b>{t('runmap.gap.title')}</b>
            <span className="svc-reason">{t('runmap.gap.body')}</span>
          </div>
        );
      case 'empty':
        return (
          <div className={`svc-card f-${data.family}`}>
            <span className="svc-glyph"><Signal family={data.family} /></span>
            <b>{t('runmap.noSession')}</b>
            <span className="svc-reason">{t(data.family === 'unknown' ? 'runmap.sessionsUnread' : 'runmap.sessionsNone')}</span>
          </div>
        );
      case 'gate':
        return (
          <div className={`svc-card f-${data.family}`}>
            <span className="svc-glyph"><Signal family={data.family} /></span>
            <b>{data.gate.label}</b>
            <span className="mono">{data.gate.status}</span>
            <span className="svc-reason">{data.gate.reason}</span>
          </div>
        );
      case 'probe':
        return (
          <div className={`svc-card f-${data.family}`}>
            <span className="svc-glyph"><Signal family={data.family} /></span>
            <b>{data.evidence.label}</b>
            <span className="mono">{[data.evidence.status, ...data.readings].join(' · ')}</span>
          </div>
        );
      case 'preview':
        return (
          <div className={`svc-card f-${data.family}`}>
            <span className="svc-glyph"><Signal family={data.family} live={data.session?.status === 'starting'} /></span>
            <b>{t('runmap.preview')}</b>
            <span className="mono">{data.state}</span>
            <span className="svc-reason">{data.session?.preview_url ?? data.session?.reason ?? ''}</span>
          </div>
        );
      case 'console':
        return (
          <div className={`svc-card f-${data.family}`}>
            <span className="svc-glyph"><Signal family={data.family} /></span>
            <b>{t('runmap.console')}</b>
            <span className="mono">{data.read ? t('runmap.errors', { count: data.errors }) : 'unknown'}</span>
            <span className="svc-reason">{t('runmap.consoleLines', { count: data.total })}</span>
          </div>
        );
      default:
        return null;
    }
  };

  const tip = (node: GraphNode<ChainNodeData>) => {
    const data = node.data;
    if (data.kind === 'gate') return <><strong>{data.gate.label}</strong><span className="mono">{data.gate.status}</span>{data.gate.reason ? <p className="tip-body">{data.gate.reason}</p> : null}</>;
    if (data.kind === 'probe') return <><strong>{data.evidence.label}</strong><span className="mono">{[data.evidence.status, ...data.readings].join(' · ')}</span>{data.evidence.reason ? <p className="tip-body">{data.evidence.reason}</p> : null}</>;
    if (data.kind === 'preview') return <><strong>{t('runmap.preview')}</strong><span className="mono">{data.state}</span>{data.session?.reason ? <p className="tip-body">{data.session.reason}</p> : null}</>;
    if (data.kind === 'console') return <><strong>{t('runmap.console')}</strong><span className="mono">{t('runmap.errors', { count: data.errors })}</span></>;
    return null;
  };

  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;
  const sessionHref = session && testRoomLink ? testRoomLink(session.id) : null;

  return (
    <GraphCanvas
      label={t('runmap.label')}
      className="topo-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={tip}
      selected={selected}
      onSelect={setSelected}
      onEnter={(id, element) => {
        const kind = nodes.find((node) => node.id === id)?.data.kind;
        if (sessionHref && (kind === 'gate' || kind === 'probe')) push(sessionHref, element);
      }}
      fitKey={`run:${session?.id ?? 'none'}:${preview?.session_id ?? 'none'}`}
      maxFit={1}
      height={{ min: 320, max: 580 }}
      bottom={48}
    >
      {chosen?.kind === 'gate' ? (
        <Inspector
          eyebrow={t('runmap.gate')}
          title={chosen.gate.label}
          family={chosen.family}
          state={chosen.gate.status}
          source={`GET /api/test-room/{project_id}/sessions · gates[${chosen.gate.gate}]`}
          onClose={() => setSelected(null)}
        >
          {chosen.gate.reason ? <p className="body ink2">{chosen.gate.reason}</p> : null}
          {chosen.gate.blockers.length > 0 ? (
            <div className="stack" style={{ gap: 4 }}>
              <span className="label">{t('runmap.blockers')}</span>
              <span className="chips">{chosen.gate.blockers.map((item) => <span key={item} className="chip mono">{item}</span>)}</span>
            </div>
          ) : null}
          <p className="meta">{t('runmap.evidenceCount', { count: chosen.gate.evidence.length })}</p>
          {sessionHref ? <div className="btn-row"><HeroLink className="btn btn-ghost btn-sm" href={sessionHref}>{t('links.openInTestRoom')}</HeroLink></div> : null}
        </Inspector>
      ) : null}
      {chosen?.kind === 'probe' ? (
        <Inspector
          eyebrow={t(`runmap.kind.${chosen.evidence.kind}`)}
          title={chosen.evidence.label}
          family={chosen.family}
          state={chosen.evidence.status}
          source={`GET /api/test-room/{project_id}/sessions · gates[${chosen.gate}].evidence[${chosen.evidence.id}]`}
          onClose={() => setSelected(null)}
        >
          {chosen.readings.length > 0 ? <p className="mono">{chosen.readings.join(' · ')}</p> : null}
          {chosen.evidence.reason ? <p className="body ink2">{chosen.evidence.reason}</p> : null}
          {chosen.evidence.command ? <p className="mono wrap-any">{chosen.evidence.command}</p> : null}
          {chosen.evidence.observed_at ? <p className="meta">{formatWhen(chosen.evidence.observed_at, locale)}</p> : null}
          {sessionHref ? <div className="btn-row"><HeroLink className="btn btn-ghost btn-sm" href={sessionHref}>{t('links.openInTestRoom')}</HeroLink></div> : null}
        </Inspector>
      ) : null}
      {chosen?.kind === 'preview' ? (
        <Inspector title={t('runmap.preview')} family={chosen.family} state={chosen.state} source="GET /api/live-preview/by-project/{project_id}" onClose={() => setSelected(null)}>
          {chosen.session?.reason ? <p className="body ink2">{chosen.session.reason}</p> : null}
          {chosen.session?.preview_url ? <p className="mono wrap-any">{chosen.session.preview_url}</p> : null}
        </Inspector>
      ) : null}
      {chosen?.kind === 'console' ? (
        <Inspector title={t('runmap.console')} family={chosen.family} state={t('runmap.errors', { count: chosen.errors })} source="GET /api/live-preview/{session_id}/console" onClose={() => setSelected(null)}>
          <p className="body ink2">{t('runmap.consoleBody', { errors: chosen.errors, warnings: chosen.warnings, total: chosen.total })}</p>
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
