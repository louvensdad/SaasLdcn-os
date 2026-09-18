/**
 * The design's screen ids, resolved to this app's routes.
 *
 * A guide names screens by id (`P-EVD`, `L-TPL`, …) because it is written once and read from anywhere.
 * A screen whose route takes a `:projectKey` cannot be opened from a guide, which knows no project — those
 * resolve to the project list, and the guide says so, rather than linking to a route with a placeholder in it.
 */
const GLOBAL: Readonly<Record<string, string>> = {
  'G-CMD': '/',
  'G-INB': '/inbox',
  'G-ACT': '/inbox/activity',
  'G-PRJ': '/projects',
  'G-NEW': '/new',
  'G-LRN': '/learn',
  'G-TRM': '/learn/terms',
  'L-CERT': '/library/certification',
  'L-KNW': '/library/knowledge',
  'L-MKT': '/library/marketplace',
  'L-RSR': '/library/research',
  'L-TECH': '/library/technology',
  'L-TPL': '/library/templates',
  'S-AUTO': '/studio/automations',
  'S-DATA': '/studio/data',
  'W-DIR': '/workforce',
  'W-PLN': '/workforce/planner',
  'A-ACC': '/settings/account',
  'A-AI': '/settings/ai',
  'A-GIT': '/settings/integrations',
  'A-PLAN': '/settings/plan',
  'A-PREF': '/settings/preferences',
  'A-WS': '/settings/workspace',
  'X-CFG': '/platform/config',
  'X-DEC': '/platform/decisions',
  'X-HLT': '/platform',
  'X-RMP': '/platform/roadmap',
  'U-PRICE': '/pricing',
};

/** Screens that live inside a project: the reader picks one first. */
const IN_PROJECT = new Set([
  'P-OVR', 'P-DSC', 'P-REQ', 'P-ARC', 'P-REV', 'P-MSL', 'P-MSN', 'P-CMP', 'P-AGT', 'P-JOB',
  'P-EVD', 'P-DLV', 'P-WBN', 'P-CHG', 'P-BLD', 'P-RUN', 'P-MOD', 'P-GOV', 'P-MEM',
]);

/** Screens a guide can name but that only a mission or a session reaches. */
const IN_MISSION = new Set(['G-MSW', 'S-DSES']);

export interface ScreenLink {
  readonly href: string;
  /** True when the link lands on a list because the screen itself needs a project or a mission chosen first. */
  readonly needsChoice: boolean;
}

export function screenLink(id: string): ScreenLink | null {
  const direct = GLOBAL[id];
  if (direct) return { href: direct, needsChoice: false };
  if (IN_PROJECT.has(id)) return { href: '/projects', needsChoice: true };
  if (IN_MISSION.has(id)) return { href: id === 'S-DSES' ? '/studio/data' : '/new', needsChoice: true };
  return null;
}
