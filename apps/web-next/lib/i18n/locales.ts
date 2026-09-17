export const LOCALES = ['pt-BR', 'en-US', 'es-ES', 'fr-FR'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'pt-BR';
export const LOCALE_COOKIE = 'ldcn_next_locale';

export const LOCALE_LABEL: Readonly<Record<Locale, string>> = {
  'pt-BR': 'Português',
  'en-US': 'English',
  'es-ES': 'Español',
  'fr-FR': 'Français',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
