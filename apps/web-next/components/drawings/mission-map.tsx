'use client';

import type { ResilientGenerationJob } from '@contracts/generation-job.contract';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { GraphCanvas } from '@/components/canvas/graph-canvas';
import { useHeroPush } from '@/components/hero-link';
import type { GraphNode } from '@/components/canvas/geometry';
import { Signal } from '@/components/signal';
import { api } from '@/lib/api/api';
import { useI18n } from '@/lib/i18n/i18n';
import {
  layoutMissionMap, missionStations, RUN, type MapNodeData, type MapStage, type MapStation, type MapStationId,
} from '@/lib/mission/mission-map';

import { Inspector } from './inspector';

const LEGEND = ['proof', 'pulse', 'hand', 'fault', 'idle', 'unknown'] as const;

/**
 * The mission map on the mission screen. Its stations come from four reads (room, job, kernel, delivery); a station
 * whose read is missing says so. Selecting a stage of the generation drives the stage panel under the map.
 */
export function MissionMap({ projectKey, job, stage, onStage }: {
  readonly projectKey: string;
  readonly job: ResilientGenerationJob;
  readonly stage: string;
  readonly onStage: (stage: string) => void;
}) {
  const { t } = useI18n();
  const push = useHeroPush();
  const base = `/p/${encodeURIComponent(projectKey)}`;
  const generatedProjectId = job.generatedProjectId ?? null;

  const room = useQuery({ queryKey: ['room', projectKey], queryFn: () => api.room(projectKey), retry: false });
  const kernel = useQuery({
    queryKey: ['kernel', generatedProjectId],
    queryFn: () => api.kernel(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });
  const delivery = useQuery({
    queryKey: ['delivery', generatedProjectId],
    queryFn: () => api.deliveryDecision(String(generatedProjectId)),
    enabled: Boolean(generatedProjectId),
    retry: false,
  });

  const [selected, setSelected] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);

  const { stations, stages } = useMemo(
    () => missionStations({
      room: { data: room.data, isError: room.isError },
      job,
      kernel: { data: kernel.data, isError: kernel.isError },
      delivery: { data: delivery.data, isError: delivery.isError },
      base,
    }),
    [base, delivery.data, delivery.isError, job, kernel.data, kernel.isError, room.data, room.isError],
  );
  const name = (id: MapStationId) => t(`map.station.${id}`);

  /* A station whose family differs from the previous read settles once; the first read never animates. */
  const seen = useRef<Map<string, string> | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(new Set());
  useEffect(() => {
    const current = new Map([...stations.map((item) => [item.id, item.family] as const), ...stages.map((item) => [`stage:${item.id}`, item.family] as const)]);
    const previous = seen.current;
    seen.current = current;
    if (!previous) return undefined;
    const moved = [...current.entries()].filter(([id, family]) => previous.has(id) && previous.get(id) !== family).map(([id]) => id);
    if (moved.length === 0) return undefined;
    setChanged(new Set(moved));
    const timer = window.setTimeout(() => setChanged(new Set()), 1300);
    return () => window.clearTimeout(timer);
  }, [stages, stations]);
  const { nodes, edges } = useMemo(() => layoutMissionMap({
    stations,
    stages,
    expanded,
    name: (id) => t(`map.station.${id}`),
    stageLabel: (item) => t('map.stageLabel', { stage: item.id, state: item.state }),
    toggleLabel: (open) => t(open ? 'map.stages.hide' : 'map.stages.show'),
  }), [expanded, stages, stations, t]);

  const stationById = new Map(stations.map((item) => [item.id, item]));
  const selectedStation = selected && !selected.startsWith('stage:') ? stationById.get(selected as MapStationId) : undefined;
  const selectedStage = selected?.startsWith('stage:') ? stages.find((item) => `stage:${item.id}` === selected) : undefined;
  /* The stage in the panel is lit on the map even before anyone clicks: the two views agree. */
  const shownSelection = selected ?? (stage ? `stage:${stage}` : null);

  const select = (id: string | null) => {
    setSelected(id);
    if (id?.startsWith('stage:')) onStage(id.slice('stage:'.length));
  };
  const enter = (id: string, element: HTMLElement) => {
    if (id.startsWith('stage:')) {
      select(id);
      document.getElementById('stage-panel')?.scrollIntoView({ block: 'start' });
      return;
    }
    const href = stationById.get(id as MapStationId)?.href;
    if (href) push(href, element);
  };

  const renderNode = (node: GraphNode<MapNodeData>) => {
    const data = node.data;
    if (data.kind === 'band') return <div className="band"><span className="label">{t(`map.phase.${data.phase}`)}</span></div>;
    if (data.kind === 'stage') return <StageDial stage={data.stage} settle={changed.has(node.id)} />;
    return <StationDial station={data.station} name={name(data.station.id)} vertical={data.vertical} settle={changed.has(node.id)} />;
  };

  const tip = (node: GraphNode<MapNodeData>) => {
    const data = node.data;
    if (data.kind === 'band') return null;
    if (data.kind === 'stage') {
      return (
        <>
          <strong>{t('map.stageLabel', { stage: data.stage.id, state: data.stage.state })}</strong>
          <span className="tip-hint">{t('map.stageHint')}</span>
        </>
      );
    }
    return (
      <>
        <strong>{name(data.station.id)}</strong>
        <span className="mono">{data.station.state}</span>
        <p className="tip-body">{t(`map.why.${data.station.id}`)}</p>
        <span className="tip-hint">{t('canvas.tipHint')}</span>
      </>
    );
  };

  return (
    <div className="mission-map">
      <GraphCanvas
        label={t('map.label')}
        className="map-canvas only-wide"
        nodes={nodes}
        edges={edges}
        render={renderNode}
        tip={tip}
        selected={shownSelection}
        onSelect={select}
        onEnter={enter}
        onToggle={() => setExpanded((open) => !open)}
        traceOnSelect={false}
        fitKey={`map:${job.id}:${expanded ? stages.length : 0}`}
        height={{ min: 440, max: 640 }}
      >
        <div className="g-hud">
          <div className="g-legend">
            {LEGEND.map((family) => <span key={family}><Signal family={family} />{t(`map.legend.${family}`)}</span>)}
          </div>
        </div>
        {selectedStation ? (
          <StationInspector station={selectedStation} name={name(selectedStation.id)} onClose={() => setSelected(null)} />
        ) : null}
        {selectedStage ? (
          <Inspector
            eyebrow={t('map.station.generate')}
            title={selectedStage.id}
            family={selectedStage.family}
            state={selectedStage.state}
            live={selectedStage.live}
            source={`GET /api/meta-factory/jobs/{job_id} · stageStatuses.${selectedStage.id}`}
            onClose={() => setSelected(null)}
          >
            <p className="body ink2">{t('map.stageHint')}</p>
          </Inspector>
        ) : null}
      </GraphCanvas>

      <ol className="mpath only-narrow" aria-label={t('map.path')}>
        {stations.map((item) => (
          <li key={item.id} className={`${item.id === 'delivery' ? 'is-gate ' : ''}f-${item.family}${item.id === RUN[0] ? ' is-turn' : ''}`}>
            <PathRow station={item} name={name(item.id)} />
            {item.id === 'generate' && stages.length > 0 ? (
              <ol className="mpath-stages" aria-label={t('map.stages.title')}>
                {stages.map((entry) => (
                  <li key={entry.id} className={`f-${entry.family}`}>
                    <button type="button" className="mpath-row" aria-pressed={stage === entry.id} onClick={() => onStage(entry.id)}>
                      <span className="mpath-dial is-sub"><Signal family={entry.family} live={entry.live} label={entry.id} /></span>
                      <span className="mpath-text"><b>{entry.id}</b><span className="mono">{entry.state}</span></span>
                    </button>
                  </li>
                ))}
              </ol>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StationDial({ station, name, vertical, settle }: { readonly station: MapStation; readonly name: string; readonly vertical: boolean; readonly settle: boolean }) {
  const shape = `st f-${station.family}${vertical ? ' st-v' : ''}${station.id === 'delivery' ? ' is-gate' : ''}${station.live ? ' is-live' : ''}${settle ? ' just-changed' : ''}`;
  return (
    <div className={shape}>
      <div className="st-dial"><Signal family={station.family} live={station.live} /></div>
      <div className="st-cap">
        <span className="st-label">{name}</span>
        <span className="st-state">{station.state}</span>
      </div>
    </div>
  );
}

function StageDial({ stage, settle }: { readonly stage: MapStage; readonly settle: boolean }) {
  return (
    <div className={`st is-sub f-${stage.family}${stage.live ? ' is-live' : ''}${settle ? ' just-changed' : ''}`}>
      <div className="st-dial"><Signal family={stage.family} live={stage.live} /></div>
      <div className="st-cap">
        <span className="st-label">{stage.id}</span>
        <span className="st-state">{stage.state}</span>
      </div>
    </div>
  );
}

function StationInspector({ station, name, onClose }: { readonly station: MapStation; readonly name: string; readonly onClose: () => void }) {
  const { t } = useI18n();
  const note = station.family === 'unknown' ? t('map.unread') : station.state === 'NOT_RUN' ? t('map.notRun') : null;
  return (
    <Inspector
      eyebrow={t(RUN.includes(station.id) ? 'map.phase.run' : 'map.phase.define')}
      title={name}
      family={station.family}
      state={station.state}
      live={station.live}
      source={station.source}
      onClose={onClose}
    >
      <p className="body ink2">{t(`map.why.${station.id}`)}</p>
      {note ? <p className="meta">{note}</p> : null}
      {station.href ? (
        <div className="btn-row">
          <Link className="btn btn-ghost btn-sm" href={station.href}>{t('map.open', { name })}</Link>
        </div>
      ) : null}
    </Inspector>
  );
}

function PathRow({ station, name }: { readonly station: MapStation; readonly name: string }) {
  const body = (
    <>
      <span className="mpath-dial"><Signal family={station.family} live={station.live} label={name} /></span>
      <span className="mpath-text"><b>{name}</b><span className="mono">{station.state}</span></span>
    </>
  );
  return station.href ? <Link className="mpath-row" href={station.href}>{body}</Link> : <div className="mpath-row">{body}</div>;
}
