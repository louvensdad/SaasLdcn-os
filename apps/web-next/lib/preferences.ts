/* Per-device display preferences. The design tokens react to `data-theme`, `data-density`, `data-motion` and
   `data-dev` on <html>. */

export type ThemeMode = 'system' | 'dark' | 'light';
export type Density = 'comfortable' | 'compact';
export type MotionMode = 'full' | 'reduced';

const THEME_KEY = 'ldcn-next-theme';
const DENSITY_KEY = 'ldcn-next-density';
const MOTION_KEY = 'ldcn-next-motion';
const DEV_KEY = 'ldcn-next-dev';

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the preference then lasts for this page only.
  }
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function readTheme(): ThemeMode {
  const value = read(THEME_KEY);
  return value === 'dark' || value === 'light' ? value : 'system';
}

export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  store(THEME_KEY, mode);
}

export function readDensity(): Density {
  return read(DENSITY_KEY) === 'compact' ? 'compact' : 'comfortable';
}

export function applyDensity(density: Density): void {
  document.documentElement.setAttribute('data-density', density);
  store(DENSITY_KEY, density);
}

/** Reduced motion turns every transition into a cut. The OS preference already does; this is the in-app switch. */
export function readMotion(): MotionMode {
  return read(MOTION_KEY) === 'reduced' ? 'reduced' : 'full';
}

export function applyMotion(mode: MotionMode): void {
  const root = document.documentElement;
  if (mode === 'reduced') root.setAttribute('data-motion', 'reduced');
  else root.removeAttribute('data-motion');
  store(MOTION_KEY, mode);
}

/** Developer details: the endpoint each screen read, raw ids and backend payloads. Hidden unless asked for. */
export function readDeveloper(): boolean {
  return read(DEV_KEY) === 'on';
}

export function applyDeveloper(on: boolean): void {
  document.documentElement.setAttribute('data-dev', on ? 'on' : 'off');
  store(DEV_KEY, on ? 'on' : 'off');
}

/** True when the person, or their operating system, asked for less motion. */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return document.documentElement.getAttribute('data-motion') === 'reduced'
    || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Inline in <head> so the first painted frame already uses the saved theme, density, motion and details setting. */
export const DISPLAY_BOOTSTRAP = `try{var d=document.documentElement,t=localStorage.getItem('${THEME_KEY}');if(t==='dark'||t==='light')d.setAttribute('data-theme',t);d.setAttribute('data-density',localStorage.getItem('${DENSITY_KEY}')==='compact'?'compact':'comfortable');if(localStorage.getItem('${MOTION_KEY}')==='reduced')d.setAttribute('data-motion','reduced');d.setAttribute('data-dev',localStorage.getItem('${DEV_KEY}')==='on'?'on':'off');}catch(e){}`;
