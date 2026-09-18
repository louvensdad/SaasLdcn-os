'use client';

import { useMemo, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import type { CompositionRead, StackCertificationRecord, TestRoomProfileEntry } from '@/lib/api/types';
import { formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';
import { familyFor } from '@/lib/status';
import { layoutTechnologyGraph, type TechData } from '@/lib/library/technology-graph';

import { Inspector } from './inspector';

type Filter = 'all' | 'certified' | 'uncertified';

/** Languages → build profiles → compositions, each with the verdict the certification ledger recorded. */
export function TechnologyGraph({ profiles, records, compositions }: {
  readonly profiles: readonly TestRoomProfileEntry[];
  readonly records: readonly StackCertificationRecord[] | null;
  readonly compositions: readonly CompositionRead[];
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const { nodes, edges } = useMemo(() => layoutTechnologyGraph({ profiles, records, compositions }), [compositions, profiles, records]);

  /* The verdict filter dims what does not match; a language stays lit when one of its profiles does. */
  const lit = useMemo(() => {
    if (filter === 'all') return null;
    const wanted = (family: string) => (filter === 'certified' ? family === 'proof' : family !== 'proof');
    const ids = new Set<string>();
    for (const node of nodes) {
      if (node.data.kind === 'profile' && wanted(node.data.family)) {
        ids.add(node.id);
        ids.add(`language:${node.data.profile.language}`);
      }
      if (node.data.kind === 'composition' && wanted(node.data.family)) ids.add(node.id);
    }
    return ids;
  }, [filter, nodes]);

  const chosen = selected ? nodes.find((node) => node.id === selected)?.data : undefined;

  const render = (node: GraphNode<TechData>) => {
    const data = node.data;
    if (data.kind === 'column') return <div className="col-head"><span className="label">{t(`techmap.col.${data.column}`)}</span></div>;
    if (data.kind === 'language') {
      return (
        <div className="svc-card">
          <span className="svc-glyph"><Signal family="idle" /></span>
          <b className="mono">{data.language}</b>
          <span className="mono">{t('techmap.profiles', { count: data.profiles })}</span>
        </div>
      );
    }
    if (data.kind === 'profile') {
      return (
        <div className={`svc-card f-${data.family}`}>
          <span className="svc-glyph"><Signal family={data.family} /></span>
          <b className="mono">{data.profile.framework}{data.profile.tool ? ` @${data.profile.tool}` : ''}</b>
          <span className="mono">{data.verdict} · {data.profile.supportLevel}</span>
        </div>
      );
    }
    return (
      <div className={`svc-card f-${data.family}`}>
        <span className="svc-glyph"><Signal family={data.family} /></span>
        <b className="mono">{data.composition.id.replace(/^composition:/, '')}</b>
        <span className="mono">{data.composition.verdict} · {data.composition.mode}</span>
      </div>
    );
  };

  return (
    <GraphCanvas
      label={t('techmap.label')}
      className="proof-canvas"
      nodes={nodes}
      edges={edges}
      render={render}
      tip={(node) => (node.data.kind === 'profile'
        ? <><strong>{node.data.profile.id}</strong><span className="mono">{node.data.verdict}</span></>
        : node.data.kind === 'composition' ? <><strong>{node.data.composition.id}</strong><span className="mono">{node.data.composition.verdict} · {node.data.composition.mode}</span></> : null)}
      selected={selected}
      onSelect={setSelected}
      lit={lit}
      fitKey={`tech:${profiles.length}:${compositions.length}`}
      maxFit={1}
      height={{ min: 360, max: 680 }}
    >
      <div className="g-hud">
        <div className="seg" role="group" aria-label={t('techmap.filter')}>
          {(['all', 'certified', 'uncertified'] as const).map((value) => (
            <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}>{t(`techmap.filter.${value}`)}</button>
          ))}
        </div>
      </div>
      {chosen?.kind === 'profile' ? (
        <Inspector
          eyebrow={chosen.profile.language}
          title={chosen.profile.id}
          family={chosen.family}
          state={chosen.verdict}
          source="GET /api/test-room/profiles · GET /api/registry/stack-certifications · profile_id"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">
            {chosen.record
              ? t('techmap.certifiedAt', { when: formatWhen(chosen.record.executed_at, locale) })
              : chosen.verdict === 'unknown' ? t('techmap.ledgerUnreadable') : t('techmap.neverCertified')}
          </p>
          <dl className="kv">
            <dt>{t('techmap.support')}</dt>
            <dd className="mono">{chosen.profile.supportLevel}</dd>
            <dt>{t('techmap.proves')}</dt>
            <dd>
              <span className="chips">
                {(Object.entries(chosen.profile.proves) as [string, boolean][]).map(([key, value]) => (
                  <span key={key} className="chip mono"><Signal family={value ? 'proof' : 'na'} label={key} />{key.replace('proves_', '')}</span>
                ))}
              </span>
            </dd>
            {chosen.profile.limitations.length > 0 ? (
              <>
                <dt>{t('techmap.limitations')}</dt>
                <dd>{chosen.profile.limitations.join(' · ')}</dd>
              </>
            ) : null}
          </dl>
        </Inspector>
      ) : null}
      {chosen?.kind === 'composition' ? (
        <Inspector
          eyebrow={chosen.composition.mode}
          title={chosen.composition.id}
          family={chosen.family}
          state={chosen.composition.verdict}
          source="GET /api/workforce/compositions · GET /api/registry/stack-certifications · stack_id"
          onClose={() => setSelected(null)}
        >
          <p className="body ink2">{t('techmap.membersNote', { stacks: chosen.recordedStacks.join(', ') || '—' })}</p>
          <div className="list">
            {chosen.composition.checks.map((check) => (
              <div className="li" key={check.dimension}>
                <Signal family={familyFor(check.status)} label={check.status} />
                <span className="li-title mono">{check.dimension}</span>
                <span className="meta mono">{check.status}</span>
              </div>
            ))}
          </div>
        </Inspector>
      ) : null}
    </GraphCanvas>
  );
}
