'use client';

import { useI18n } from '@/lib/i18n/i18n';

/* The glyph each station wears is the one the product uses for that thing elsewhere; idea has none yet, so a dot. */
const STATIONS = [
  { id: 'idea', x: 70, y: 70, glyph: null },
  { id: 'architecture', x: 70, y: 200, glyph: 'r-architect' },
  { id: 'company', x: 214, y: 330, glyph: 'i-workforce' },
  { id: 'code', x: 334, y: 330, glyph: 'i-engineering' },
  { id: 'evidence', x: 454, y: 330, glyph: 'ev-test_run' },
] as const;

/**
 * The sign-in story: the mark's gesture at the scale of a mission — define descends, the work turns and runs to the
 * gate. The map is at rest from the first frame; the path draws over it once (not at all under reduced motion) and
 * never loops. It reports nothing.
 */
export function SignInStory() {
  const { t } = useI18n();
  const label = [...STATIONS.map((station) => t(`story.${station.id}`)), 'READY'].join(', ');
  return (
    <svg className="story" viewBox="46 46 568 356" role="img" aria-label={label}>
      <path className="story-rail" d="M70 88V296a34 34 0 0 0 34 34H548" />
      <path className="story-path" pathLength={1} d="M70 88V296a34 34 0 0 0 34 34H548" />
      {STATIONS.map((station) => {
        const define = station.id === 'idea' || station.id === 'architecture';
        return (
          <g key={station.id} className="story-st">
            <circle cx={station.x} cy={station.y} r={22} />
            {station.glyph
              ? <use className="story-glyph" href={`#${station.glyph}`} x={station.x - 11} y={station.y - 11} width={22} height={22} />
              : <circle className="story-core" cx={station.x} cy={station.y} r={5} />}
            <text x={define ? station.x + 38 : station.x} y={define ? station.y + 6 : station.y + 48} textAnchor={define ? 'start' : 'middle'}>
              {t(`story.${station.id}`)}
            </text>
          </g>
        );
      })}
      <g className="story-st is-gate">
        <path d="M578 300l30 30-30 30-30-30z" />
        <path className="story-check" d="M566 331l8 8 15-16" />
        <text x={578} y={390} textAnchor="middle">READY</text>
      </g>
    </svg>
  );
}
