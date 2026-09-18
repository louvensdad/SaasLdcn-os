/*
 * Context transitions (docs/NEXT-UI-V2-MOTION.md §6): the element a person chose travels into the title of the place it
 * opens, and the rest of the page cross-fades. Progressive enhancement only: without the View Transitions API, under
 * reduced motion (the OS setting or the in-app switch), or for a link that stays on the same path, navigation is the
 * plain cut with the shell's arrival fade. The morph never waits for data: if the new title has not drawn within the
 * budget, the chosen element fades out with the page instead of travelling.
 */

const TITLE_BUDGET_MS = 300;
const POLL_MS = 16;

function motionReduced(): boolean {
  return document.documentElement.getAttribute('data-motion') === 'reduced'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

const later = (ms: number) => new Promise<void>((resolve) => { window.setTimeout(resolve, ms); });

/* The browser does not paint while the update runs, so this waits on timers, never on animation frames. */
async function arrivedTitle(pathname: string, previous: Element | null): Promise<HTMLElement | null> {
  const deadline = Date.now() + TITLE_BUDGET_MS;
  while (Date.now() < deadline) {
    if (window.location.pathname === pathname) {
      /* A title still waiting for its name (aria-busy) is not the place yet: travelling into it would land on a key. */
      const title = document.querySelector<HTMLElement>('#main h1:not([aria-busy="true"])');
      if (title && !previous?.contains(title)) return title;
    }
    await later(POLL_MS);
  }
  return null;
}

/** Runs `navigate` inside a view transition that carries `from` into the destination's title; false when it cannot. */
export function heroNavigate(from: HTMLElement | null | undefined, href: string, navigate: () => void): boolean {
  if (!from || typeof document.startViewTransition !== 'function' || motionReduced()) return false;
  const target = new URL(href, window.location.href);
  if (target.origin !== window.location.origin || target.pathname === window.location.pathname) return false;

  const previous = document.querySelector('#main .canvas-inner');
  let title: HTMLElement | null = null;
  from.style.setProperty('view-transition-name', 'hero');
  const transition = document.startViewTransition(async () => {
    from.style.removeProperty('view-transition-name');
    navigate();
    title = await arrivedTitle(target.pathname, previous);
    if (!title) return;
    title.style.setProperty('view-transition-name', 'hero');
    /* The place arrives through the morph; its own arrival fade would play a second time. */
    title.closest('.canvas-inner')?.classList.add('is-morphed');
  });
  const settle = () => { title?.style.removeProperty('view-transition-name'); };
  transition.finished.then(settle, settle);
  return true;
}
