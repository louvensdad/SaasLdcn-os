'use client';

import type { Family } from '@/components/signal';
import { useI18n } from '@/lib/i18n/i18n';
import type { LinePoint } from '@/lib/work/mission-line';

/**
 * A project's mission compressed into one line of points. The shape carries the family — filled dot proven, ring
 * running, diamond waiting on a person, square failed, small open ring not reached — and the dashed tail stands for
 * the stations only the project screen reads.
 */
export function MissionLine({ points, label, gap = 30, r = 5.5 }: {
  readonly points: readonly LinePoint[];
  readonly label: string;
  readonly gap?: number;
  readonly r?: number;
}) {
  const { t } = useI18n();
  const pad = r + 3;
  const split = 10;
  const xs = points.map((_, i) => pad + i * gap + (i > 1 ? split : 0));
  const tail = 26;
  const last = xs[xs.length - 1] ?? pad;
  const width = last + r + tail + 4;
  const height = r * 2 + 8;
  const y = height / 2;
  const segment = (a: Family, b: Family) => (a === 'idle' || b === 'idle' || a === 'na' || b === 'na' || a === 'unknown' || b === 'unknown' ? 'idle' : b);
  const summary = points.map((point) => `${t(`line.point.${point.id}`)} ${point.state}`).join(' · ');

  return (
    <svg className="mline" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${summary}`}>
      {points.slice(1).map((point, i) => (
        <path key={`s-${point.id}`} className={`ml-seg f-${segment(points[i]!.family, point.family)}`} d={`M${xs[i]! + r + 2} ${y}H${xs[i + 1]! - r - 2}`} />
      ))}
      <path className="ml-seg ml-tail" d={`M${last + r + 3} ${y}H${width - 2}`} />
      {points.map((point, i) => {
        const x = xs[i]!;
        const title = <title>{`${t(`line.point.${point.id}`)}: ${point.state}`}</title>;
        if (point.family === 'hand') {
          return <path key={point.id} className="ml-dot f-hand" d={`M${x} ${y - r - 1.5}L${x + r + 1.5} ${y}L${x} ${y + r + 1.5}L${x - r - 1.5} ${y}z`}>{title}</path>;
        }
        if (point.family === 'fault') {
          return <rect key={point.id} className="ml-dot f-fault" x={x - r} y={y - r} width={r * 2} height={r * 2} rx={2}>{title}</rect>;
        }
        if (point.family === 'pulse') return <circle key={point.id} className="ml-dot f-pulse" cx={x} cy={y} r={r - 0.8}>{title}</circle>;
        if (point.family === 'idle' || point.family === 'na' || point.family === 'unknown' || point.family === 'stop') {
          return <circle key={point.id} className={`ml-dot f-${point.family}`} cx={x} cy={y} r={r - 1.6}>{title}</circle>;
        }
        return <circle key={point.id} className={`ml-dot f-${point.family}`} cx={x} cy={y} r={r}>{title}</circle>;
      })}
    </svg>
  );
}
