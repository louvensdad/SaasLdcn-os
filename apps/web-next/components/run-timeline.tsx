'use client';

import type { TestRoomSessionView } from '@contracts/test-room.contract';
import { useMemo, type CSSProperties } from 'react';

import { Signal } from '@/components/signal';
import { evidenceFamily, runSpan } from '@/lib/evidence/test-room';
import { formatDuration, formatWhen } from '@/lib/format';
import { useI18n } from '@/lib/i18n/i18n';

/* Two labels closer than this share of the axis go on different rows; past a few rows the run reads better as a list. */
const MIN_GAP = 0.17;
const MAX_ROWS = 3;

/**
 * A session's run in time: each piece of evidence sits where it was observed (`observed_at`) between the start of the
 * session and its end. Nothing is stretched into a bar — a step's duration is a number the backend measured, shown as
 * text, not a span inferred backwards from the moment it was observed.
 */
export function RunTimeline({ session, label }: { readonly session: TestRoomSessionView; readonly label: string }) {
  const { t, locale } = useI18n();
  const span = useMemo(() => runSpan(session), [session]);
  const placed = useMemo(() => {
    const lastAt: number[] = [];
    return (span?.steps ?? []).map((step) => {
      let row = lastAt.findIndex((x) => step.at - x >= MIN_GAP);
      if (row === -1) {
        row = lastAt.length;
        lastAt.push(step.at);
      } else {
        lastAt[row] = step.at;
      }
      return { ...step, row };
    });
  }, [span]);

  if (!span) return <p className="meta">{t('testroom.run.none')}</p>;
  const rows = Math.max(1, ...placed.map((step) => step.row + 1));
  const asList = rows > MAX_ROWS;

  return (
    <div className="runline-wrap">
      <ol className={`runline${asList ? ' is-list' : ''}`} aria-label={label} style={{ '--rows': rows } as CSSProperties}>
        {placed.map((step) => {
          const family = evidenceFamily(step.evidence.status);
          const edge = step.at < 0.08 ? 'start' : step.at > 0.92 ? 'end' : undefined;
          return (
            <li
              key={step.key}
              className={`runline-step f-${family}`}
              data-edge={edge}
              style={{ '--x': `${(step.at * 100).toFixed(2)}%`, '--row': step.row } as CSSProperties}
            >
              <span className="runline-dot"><Signal family={family} label={`${step.gate.label} · ${step.evidence.label}`} /></span>
              <span className="runline-text">
                <b>{step.gate.label}</b>
                <span className="mono">{step.evidence.status}</span>
                <span className="mono">+{formatDuration(step.observedAt - span.start, locale)}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <div className="runline-ends meta">
        <span>{t('testroom.run.start', { when: formatWhen(session.started_at, locale) })}</span>
        <span>
          {span.finished
            ? t('testroom.run.end', { took: formatDuration(span.end - span.start, locale) })
            : t('testroom.run.lastStep', { took: formatDuration(span.end - span.start, locale) })}
        </span>
      </div>
    </div>
  );
}
