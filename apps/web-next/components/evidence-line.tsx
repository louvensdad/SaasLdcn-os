'use client';

import Link from 'next/link';

import { Signal, type Family } from '@/components/signal';

/**
 * The signature component: one station per lifecycle step, each showing the backend's own word. A station whose
 * source could not be read is `unknown` (dashed) — never green, never inferred from its neighbours.
 */
export interface Station {
  readonly id: string;
  readonly name: string;
  /** The backend value, shown verbatim. */
  readonly state: string;
  readonly family: Family;
  readonly live?: boolean;
  readonly current?: boolean;
  readonly href?: string;
  /** The last station of a path that ends in a decision: drawn as the rotated square of the mark. */
  readonly gate?: boolean;
}

export function EvidenceLine({ stations, size, selected, onSelect, label = 'Evidence Line' }: {
  readonly stations: readonly Station[];
  /** The accessible name of the line. */
  readonly label?: string;
  readonly size?: 'sm' | 'lg';
  readonly selected?: string;
  /** When given, a station is a button that puts itself in focus instead of a link. */
  readonly onSelect?: (id: string) => void;
}) {
  return (
    <div className="tbl-wrap">
      <div className={`evl${size ? ` evl--${size}` : ''}`} role="group" aria-label={label}>
        {stations.map((station, index) => {
          const next = stations[index + 1];
          const done = station.family === 'proof' && next && next.family !== 'na';
          const track = station.family === 'na' || next?.family === 'na' ? 't-dash' : done ? 't-done' : '';
          const className = `evl-st${station.current ? ' is-current' : ''}${station.family === 'hand' ? ' is-waiting' : ''}${station.gate ? ' is-gate' : ''}`;
          const body = (
            <>
              <span className="evl-node">
                <span className="evl-dot"><Signal family={station.family} live={station.live} label={station.name} /></span>
                <span className={`evl-track ${track}`} />
              </span>
              <span className="evl-name">{station.name}</span>
              <span className="evl-state">{station.state}</span>
            </>
          );
          if (onSelect) {
            return (
              <button key={station.id} className={className} type="button" aria-pressed={selected === station.id} onClick={() => onSelect(station.id)}>
                {body}
              </button>
            );
          }
          return station.href ? (
            <Link key={station.id} className={className} href={station.href} aria-current={selected === station.id ? 'page' : undefined}>
              {body}
            </Link>
          ) : (
            <div key={station.id} className={className}>{body}</div>
          );
        })}
      </div>
    </div>
  );
}
