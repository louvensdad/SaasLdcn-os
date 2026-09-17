import type { MessageKey } from '@/lib/i18n/messages';

/**
 * Where each destination of the approved design lives today. The new app is built in waves
 * (docs/NEXT-FRONTEND-MIGRATION-OPTIONS.md §4); a destination that is not built yet opens the current app,
 * and the link says so.
 */
export const CURRENT_APP_URL = (process.env.NEXT_PUBLIC_LDCN_CURRENT_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');

export function currentAppUrl(path: string): string {
  return `${CURRENT_APP_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface Destination {
  readonly id: string;
  readonly path: string;
  readonly label: MessageKey;
  readonly icon: string;
  readonly built: boolean;
  /** Migration wave that brings the screen to this app. */
  readonly wave: number;
  /** The same place in the current app. */
  readonly current: string;
  /** Learn guide that explains it. */
  readonly guide: string;
}

export const RAIL: readonly Destination[] = [
  { id: 'command', path: '/', label: 'nav.command', icon: 'command', built: true, wave: 2, current: '/platform', guide: 'how-it-works' },
  { id: 'projects', path: '/projects', label: 'nav.projects', icon: 'projects', built: true, wave: 2, current: '/projects', guide: 'projects' },
  { id: 'inbox', path: '/inbox', label: 'nav.inbox', icon: 'inbox', built: true, wave: 2, current: '/platform', guide: 'decisions' },
  { id: 'activity', path: '/inbox/activity', label: 'nav.activity', icon: 'activity', built: true, wave: 2, current: '/platform', guide: 'decisions' },
  { id: 'workforce', path: '/workforce', label: 'nav.workforce', icon: 'workforce', built: true, wave: 4, current: '/workforce', guide: 'certification' },
  { id: 'library', path: '/library', label: 'nav.library', icon: 'library', built: true, wave: 4, current: '/templates', guide: 'templates' },
  { id: 'studio', path: '/studio', label: 'nav.studio', icon: 'studio', built: true, wave: 6, current: '/data-intelligence', guide: 'data' },
];

export const RAIL_BOTTOM: readonly Destination[] = [
  { id: 'learn', path: '/learn', label: 'nav.learn', icon: 'learn', built: true, wave: 1, current: '/documentation', guide: 'signals' },
  { id: 'settings', path: '/settings', label: 'nav.settings', icon: 'settings', built: true, wave: 6, current: '/settings', guide: 'account' },
  { id: 'platform', path: '/platform', label: 'nav.platform', icon: 'platform', built: true, wave: 6, current: '/system-status', guide: 'platform' },
];

/** Reachable from the bar and the palette rather than the rail: an action, not a place you live in. */
export const ACTIONS: readonly Destination[] = [
  { id: 'start', path: '/new', label: 'nav.start', icon: 'projects', built: true, wave: 6, current: '/wizard', guide: 'how-it-works' },
];

const OTHER_PENDING: readonly Destination[] = [
  { id: 'project', path: '/p', label: 'nav.project', icon: 'projects', built: true, wave: 3, current: '/projects', guide: 'how-it-works' },
];

/** The destination a path belongs to: the longest destination path it sits under (so /inbox/activity is Activity). */
export function destinationFor(pathname: string): Destination | null {
  if (pathname === '/' || pathname === '') return RAIL[0];
  const all = [...RAIL, ...RAIL_BOTTOM, ...ACTIONS, ...OTHER_PENDING].filter((d) => d.path !== '/');
  const under = all.filter((d) => pathname === d.path || pathname.startsWith(`${d.path}/`));
  return under.sort((a, b) => b.path.length - a.path.length)[0] ?? null;
}

/** Legacy hrefs the backend still returns (for example in the briefing) point at the current app. */
export function legacyHrefToCurrentApp(href: string): string {
  return currentAppUrl(href);
}
