import type { Locale } from '../locales';
import type { Messages } from './index';

/**
 * One lazy chunk per locale.
 *
 * The four tables are ~140 kB gzipped together, and a reader only ever needs one. The server
 * hands the active table to `I18nProvider`, so nothing is fetched on first paint; these loaders
 * exist for the moment someone changes the language in the picker.
 *
 * The imports must stay dynamic: a static one would pull every locale back into the shell.
 */
export const LOADERS: Readonly<Record<Locale, () => Promise<Messages>>> = {
  'en-US': () => import('./en-US').then((module) => module.default),
  'pt-BR': () => import('./pt-BR').then((module) => module.default),
  'es-ES': () => import('./es-ES').then((module) => module.default),
  'fr-FR': () => import('./fr-FR').then((module) => module.default),
};
