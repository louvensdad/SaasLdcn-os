'use client';

import { useMemo, useState, type ReactNode } from 'react';

import type { Family } from '@/components/signal';
import { dayLanes, daysOf, EPISODE_GAP_MINUTES } from '@/lib/activity/day-map';
import type { ActivityEvent } from '@/lib/api/types';
import { useI18n } from '@/lib/i18n/i18n';

const WIDTH = 960;
const GUTTER = 128;
const LANE = 34;
const TOP = 26;

/** One day of recorded events, laned by category. The table under it stays the text view of the same events. */
export function DayMap({ items }: { readonly items: readonly ActivityEvent[] }) {
  const { t, locale } = useI18n();
  const days = useMemo(() => daysOf(items), [items]);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked && days.includes(picked) ? picked : days[0] ?? null;
  const lanes = useMemo(() => (day ? dayLanes(items, day) : []), [day, items]);

  if (!day) return null;
  const index = days.indexOf(day);
  const count = lanes.reduce((sum, lane) => sum + lane.events.length, 0);
  const height = TOP + lanes.length * LANE + 8;
  const x = (minute: number) => GUTTER + (minute / 1440) * (WIDTH - GUTTER - 14);
  const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <section className="daymap cc-card" aria-labelledby="daymap-title">
      <div className="panel-head">
        <h2 className="h-sub" id="daymap-title">{t('activity.map.title')}</h2>
        <span className="meta">{t('activity.map.meta', { count, day: dayLabel })}</span>
        <div className="actions">
          <button className="btn btn-quiet btn-sm" type="button" disabled={index >= days.length - 1} onClick={() => setPicked(days[index + 1] ?? day)}>
            {t('activity.map.previous')}
          </button>
          <button className="btn btn-quiet btn-sm" type="button" disabled={index <= 0} onClick={() => setPicked(days[index - 1] ?? day)}>
            {t('activity.map.next')}
          </button>
        </div>
      </div>
      <div className="daymap-body">
        <svg
          className="daymap-svg"
          viewBox={`0 0 ${WIDTH} ${height}`}
          role="img"
          aria-label={t('activity.map.label', { day: dayLabel, count, lanes: lanes.length })}
        >
          {Array.from({ length: 9 }, (_, i) => i * 180).map((minute) => (
            <g key={minute}>
              <line className="dm-tick" x1={x(minute)} x2={x(minute)} y1={TOP - 6} y2={height - 4} />
              <text className="dm-hour" x={x(minute)} y={12} textAnchor={minute === 0 ? 'start' : minute === 1440 ? 'end' : 'middle'}>
                {String(minute / 60).padStart(2, '0')}
              </text>
            </g>
          ))}
          {lanes.map((lane, row) => {
            const y = TOP + row * LANE + LANE / 2;
            return (
              <g key={lane.category}>
                <line className="dm-lane" x1={GUTTER} x2={WIDTH - 14} y1={y} y2={y} />
                <text className="dm-cat" x={GUTTER - 12} y={y + 4} textAnchor="end">{lane.category}</text>
                {lane.episodes.map((episode) => (episode.events.length > 1 ? (
                  <rect
                    key={episode.key}
                    className={`dm-episode f-${episode.family}`}
                    x={x(episode.start) - 7}
                    y={y - 9}
                    width={Math.max(14, x(episode.end) - x(episode.start) + 14)}
                    height={18}
                    rx={9}
                  />
                ) : null))}
                {lane.events.map((entry) => (
                  <Mark key={entry.event.id} family={entry.family} cx={x(entry.minute)} cy={y}>
                    <title>{`${new Date(entry.event.occurred_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })} · ${lane.category} · ${entry.event.action} · ${entry.event.status}`}</title>
                  </Mark>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <p className="meta daymap-note">{t('activity.map.note', { minutes: EPISODE_GAP_MINUTES })}</p>
    </section>
  );
}

function Mark({ family, cx, cy, children }: { readonly family: Family; readonly cx: number; readonly cy: number; readonly children: ReactNode }) {
  const r = 5;
  if (family === 'hand') return <path className="dm-mark f-hand" d={`M${cx} ${cy - r - 1}L${cx + r + 1} ${cy}L${cx} ${cy + r + 1}L${cx - r - 1} ${cy}z`}>{children}</path>;
  if (family === 'fault') return <rect className="dm-mark f-fault" x={cx - r} y={cy - r} width={r * 2} height={r * 2} rx={2}>{children}</rect>;
  if (family === 'pulse') return <circle className="dm-mark f-pulse" cx={cx} cy={cy} r={r - 0.6}>{children}</circle>;
  if (family === 'proof' || family === 'caution') return <circle className={`dm-mark f-${family}`} cx={cx} cy={cy} r={r}>{children}</circle>;
  return <circle className={`dm-mark f-${family}`} cx={cx} cy={cy} r={r - 1.5}>{children}</circle>;
}
