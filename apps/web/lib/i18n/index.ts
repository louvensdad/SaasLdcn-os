import type { LocaleCode, LocaleDefinition, TranslationKey } from '@contracts/locale.contract';

import enUS from './dictionaries/en-US.json';
import esES from './dictionaries/es-ES.json';
import frFR from './dictionaries/fr-FR.json';
import ptBR from './dictionaries/pt-BR.json';

export const DEFAULT_LOCALE: LocaleCode = 'pt-BR';
export const LOCALES: readonly LocaleDefinition[] = [
  { code: 'pt-BR', language: 'Português' as never, name: 'Portuguese (Brazil)', nativeName: 'Português', isDefault: true, direction: 'ltr' as never },
  { code: 'en-US', language: 'English' as never, name: 'English (United States)', nativeName: 'English', isDefault: false, direction: 'ltr' as never },
  { code: 'es-ES', language: 'Español' as never, name: 'Spanish (Spain)', nativeName: 'Español', isDefault: false, direction: 'ltr' as never },
  { code: 'fr-FR', language: 'Français' as never, name: 'French (France)', nativeName: 'Français', isDefault: false, direction: 'ltr' as never }
];

export const dictionaries: Record<LocaleCode, Record<string, string>> = {
  'pt-BR': { ...enUS, ...ptBR },
  'en-US': enUS,
  'es-ES': { ...enUS, ...esES },
  'fr-FR': { ...enUS, ...frFR }
};

export function translate(locale: LocaleCode, key: TranslationKey, values: Record<string, string | number> = {}, fallback: LocaleCode = DEFAULT_LOCALE) {
  let text = dictionaries[locale]?.[key] ?? dictionaries[fallback]?.[key] ?? dictionaries[DEFAULT_LOCALE][key] ?? key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}
