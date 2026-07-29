import type { LocaleCode, LocaleDefinition, TranslationKey } from '@contracts/locale.contract';

import compactSource from './compact.generated.json';

export const DEFAULT_LOCALE: LocaleCode = 'pt-BR';
export const LOCALES: readonly LocaleDefinition[] = [
  { code: 'pt-BR', language: 'Português' as never, name: 'Portuguese (Brazil)', nativeName: 'Português', isDefault: true, direction: 'ltr' as never },
  { code: 'en-US', language: 'English' as never, name: 'English (United States)', nativeName: 'English', isDefault: false, direction: 'ltr' as never },
  { code: 'es-ES', language: 'Español' as never, name: 'Spanish (Spain)', nativeName: 'Español', isDefault: false, direction: 'ltr' as never },
  { code: 'fr-FR', language: 'Français' as never, name: 'French (France)', nativeName: 'Français', isDefault: false, direction: 'ltr' as never }
];

interface CompactDictionaries {
  readonly keys: readonly string[];
  readonly locales: Record<LocaleCode, readonly string[]>;
}

const compact = compactSource as CompactDictionaries;
const dictionaryCache = new Map<LocaleCode, Record<string, string>>();

function dictionary(locale: LocaleCode): Record<string, string> {
  const cached = dictionaryCache.get(locale);
  if (cached) return cached;
  const values = compact.locales[locale];
  const entries = Object.fromEntries(compact.keys.map((key, index) => [key, values[index]]));
  dictionaryCache.set(locale, entries);
  return entries;
}

export function translate(locale: LocaleCode, key: TranslationKey, values: Record<string, string | number> = {}, fallback: LocaleCode = DEFAULT_LOCALE) {
  let text = dictionary(locale)[key] ?? dictionary(fallback)[key] ?? dictionary(DEFAULT_LOCALE)[key] ?? key;
  for (const [name, value] of Object.entries(values)) text = text.replaceAll(`{{${name}}}`, String(value));
  return text;
}
