'use client';

import { Fragment, type ReactNode } from 'react';

import { useI18n } from '@/lib/i18n/i18n';
import { statusLabel } from '@/lib/status';

import { Illustration, type IllustrationName } from './illustration';
import { Signal, type Family } from './signal';

/**
 * Status badge: glyph + what the state means, in the page's language. The backend's own value is not
 * lost -- it rides along as the badge's title and as a technical detail the developer switch reveals
 * (REDESIGN.md §3.1: keep the state in the contract, translate only its presentation).
 */
export function Badge({ value, family, human, live }: {
  readonly value: string;
  readonly family: Family;
  /** A reading this screen wants instead of the vocabulary's own phrase. */
  readonly human?: string;
  readonly live?: boolean;
}) {
  const { tDynamic } = useI18n();
  const label = human ?? statusLabel(value, tDynamic);
  return (
    <span className={`badge b-${family}`} title={value}>
      <Signal family={family} label={label} live={live} />
      <span>{label}</span>
      <span className="code">{value}</span>
    </span>
  );
}

/** Names the backend source of what is on screen. */
export function Source({ children }: { readonly children: ReactNode }) {
  return <span className="src">{children}</span>;
}

export function StateBlock({ kind, title, children, action, illustration }: {
  readonly kind: 'empty' | 'error' | 'unknown';
  readonly title: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  /** A line drawing naming the kind of emptiness; whole-screen states carry one, inline ones do not. */
  readonly illustration?: IllustrationName;
}) {
  const family: Family = kind === 'error' ? 'fault' : kind === 'unknown' ? 'unknown' : 'idle';
  return (
    <div className={`state${kind === 'error' ? ' is-error' : ''}${illustration ? ' has-illo' : ''}`} role={kind === 'error' ? 'alert' : 'status'}>
      {illustration ? <Illustration name={illustration} /> : null}
      <div className="h-sub"><Signal family={family} />{title}</div>
      {children ? <div className="body ink2">{children}</div> : null}
      {action}
    </div>
  );
}

/* The drawing a whole-screen state carries unless the screen names a more specific one. */
const PAGE_DRAWING: Readonly<Record<'empty' | 'error' | 'unknown', IllustrationName>> = { empty: 'gap', error: 'unreachable', unknown: 'notfound' };

/**
 * A whole screen that cannot be drawn, because the thing it is about could not be read or does not exist.
 *
 * It keeps the page head — a reader still needs to know which screen they are on, and every page owes its
 * one `h1` — and puts the state underneath, rather than replacing the page with a bare box.
 */
export function PageState({ eyebrow, title, kind, stateTitle, children, action, illustration }: {
  readonly eyebrow?: string;
  readonly title: string;
  readonly kind: 'empty' | 'error' | 'unknown';
  readonly stateTitle: string;
  readonly children?: ReactNode;
  readonly action?: ReactNode;
  readonly illustration?: IllustrationName;
}) {
  return (
    <>
      <div className="page-head">
        <div className="grow">
          {eyebrow ? <div className="eyebrow"><span className="label">{eyebrow}</span></div> : null}
          <h1 className="title">{title}</h1>
        </div>
      </div>
      <StateBlock kind={kind} title={stateTitle} action={action} illustration={illustration ?? PAGE_DRAWING[kind]}>{children}</StateBlock>
    </>
  );
}

export function Notice({ family, title, children }: { readonly family: Family; readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className="panel" role="status">
      <div className="panel-body stack" style={{ gap: 6 }}>
        <div className="row" style={{ gap: 8, alignItems: 'center' }}><Signal family={family} label={title} /><b>{title}</b></div>
        {children ? <div className="body ink2">{children}</div> : null}
      </div>
    </div>
  );
}

/** A backend limitation shown where it matters, with its id from the design review. */
export function GapChip({ id, detail }: { readonly id: string; readonly detail: string }) {
  const { t } = useI18n();
  return <span className="chip mono" title={detail}>{t('common.gap', { id })}</span>;
}

export function Kv({ pairs }: { readonly pairs: readonly (readonly [ReactNode, ReactNode])[] }) {
  return (
    <dl className="kv">
      {pairs.map(([k, v], i) => (
        <Fragment key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </Fragment>
      ))}
    </dl>
  );
}

export function Live({ state, children }: { readonly state: 'live' | 'stale' | 'paused' | 'snapshot'; readonly children: ReactNode }) {
  return (
    <span className={`live${state === 'live' ? '' : ` is-${state}`}`}>
      <span className="dot" />
      {children}
    </span>
  );
}

/**
 * A read in flight, drawn the size and shape of what is coming (REDESIGN.md §2: "ocupa o tamanho do
 * conteúdo esperado; sem valores zero fictícios"). It does not shimmer -- waiting is not activity -- and
 * it never stands in a number, because a placeholder zero is a claim.
 */
export function Skeleton({ lines = 3, shape = 'lines', rows = 4, columns = 4 }: {
  readonly lines?: number;
  readonly shape?: 'lines' | 'table' | 'cards' | 'facts' | 'list';
  /** Rows for a table or a list, cards for a grid, figures for a row of them. */
  readonly rows?: number;
  readonly columns?: number;
}) {
  const widths = [92, 76, 84, 60, 70];
  if (shape === 'table') {
    const track = { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` };
    return (
      <div className="sk-table" aria-hidden="true">
        <div className="sk-row is-head" style={track}>
          {Array.from({ length: columns }, (_, i) => <div key={i} className="sk" style={{ width: `${54 + (i % 3) * 12}%` }} />)}
        </div>
        {Array.from({ length: rows }, (_, row) => (
          <div className="sk-row" key={row} style={track}>
            {Array.from({ length: columns }, (_, cell) => <div key={cell} className="sk" style={{ width: `${widths[(row + cell) % widths.length]}%` }} />)}
          </div>
        ))}
      </div>
    );
  }
  if (shape === 'cards') {
    return <div className="sk-cards" aria-hidden="true">{Array.from({ length: rows }, (_, i) => <div className="sk-card" key={i} />)}</div>;
  }
  if (shape === 'facts') {
    return (
      <div className="sk-facts" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => <div className="sk-fact" key={i}><div className="sk" /><div className="sk" /></div>)}
      </div>
    );
  }
  if (shape === 'list') {
    return (
      <div className="sk-list" aria-hidden="true">
        {Array.from({ length: rows }, (_, i) => (
          <div className="sk-li" key={i}>
            <div className="sk-dot" />
            <div className="sk" style={{ width: `${widths[i % widths.length]}%` }} />
            <div className="sk" style={{ width: `${44 + (i % 3) * 9}%`, height: 9 }} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="sk" style={{ width: `${widths[i % widths.length]}%` }} />)}
    </div>
  );
}

/**
 * A leading figure: the number first, then what it counts, then -- when the number needs one -- the unit
 * and period it is of. REDESIGN.md §3.4 asks for that last line, because a cost estimate is not an
 * invoice and a percentage of flow is not a forecast of time.
 */
export function Metric({ value, label, note, badge }: {
  readonly value: ReactNode;
  readonly label: string;
  readonly note?: string;
  readonly badge?: ReactNode;
}) {
  return (
    <div className="metric">
      {badge ? <div className="metric-head">{badge}</div> : null}
      <div className="metric-value num">{value}</div>
      <div className="metric-label">{label}</div>
      {note ? <p className="metric-note">{note}</p> : null}
    </div>
  );
}
