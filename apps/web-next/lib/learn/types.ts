import type { Family } from '@/components/signal';

export type AreaId = 'start' | 'define' | 'build' | 'ship' | 'library' | 'account';

export const AREAS: readonly AreaId[] = ['start', 'define', 'build', 'ship', 'library', 'account'];

/** A screen a guide explains: `path` when it is built in this app, otherwise `current` in the current app. */
export interface GuideScreen {
  readonly id: string;
  readonly label: string;
  readonly path?: string;
  readonly current?: string;
}

export interface Guide {
  readonly id: string;
  readonly area: AreaId;
  /** The current help entry it was adapted from (apps/web service-detail-content.ts), if any. */
  readonly from?: string;
  readonly title: string;
  readonly summary: string;
  readonly screens: readonly GuideScreen[];
  readonly what: string;
  readonly why: string;
  readonly how: readonly string[];
  readonly give: string;
  readonly get: string;
  readonly who?: readonly string[];
  readonly files?: readonly string[];
  readonly limits: readonly string[];
  readonly good: readonly string[];
  readonly trouble: readonly (readonly [string, string])[];
  readonly faq?: readonly (readonly [string, string])[];
  readonly api?: readonly string[];
  readonly terms?: readonly string[];
}

/** A word the interface uses: what it means and where people meet it. */
export interface Term {
  readonly term: string;
  readonly meaning: string;
  readonly where: string;
}

export interface SignalMeaning {
  readonly family: Family;
  readonly shape: string;
  readonly meaning: string;
}
