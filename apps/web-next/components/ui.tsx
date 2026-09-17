'use client';

import { Fragment, type ReactNode } from 'react';

import { useI18n } from '@/lib/i18n/i18n';

import { Illustration, type IllustrationName } from './illustration';
import { Signal, type Family } from './signal';

/** Status badge: glyph + the exact backend value + optional plain reading. */
export function Badge({ value, family, human, live }: {
  readonly value: string;
  readonly family: Family;
  readonly human?: string;
  readonly live?: boolean;
}) {
  return (
    <span className={`badge b-${family}`}>
      <Signal family={family} label={value} live={live} />
      <span>{value}</span>
      {human ? <span className="human">{human}</span> : null}
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

export function Skeleton({ lines = 3 }: { readonly lines?: number }) {
  const widths = [92, 76, 84, 60, 70];
  return (
    <div aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => <div key={i} className="sk" style={{ width: `${widths[i % widths.length]}%` }} />)}
    </div>
  );
}
