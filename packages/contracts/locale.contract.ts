export type LocaleCode = 'pt-BR' | 'en-US' | 'es-ES' | 'fr-FR';

export enum SupportedLanguage {
  PT_BR = 'Portugu\u00EAs',
  EN_US = 'English',
  ES_ES = 'Espa\u00F1ol',
  FR_FR = 'Fran\u00E7ais',
}

export enum LocaleDirection {
  LTR = 'ltr',
  RTL = 'rtl',
}

export interface LocaleDefinition {
  readonly code: LocaleCode;
  readonly language: SupportedLanguage;
  readonly name: string;
  readonly nativeName: string;
  readonly isDefault: boolean;
  readonly direction: LocaleDirection;
}

export interface LocaleSupportContract {
  readonly defaultLocale: LocaleCode;
  readonly supportedLocales: readonly LocaleCode[];
  readonly fallbackLocale: LocaleCode;
}

export interface TranslationDictionary {
  readonly dictionaryId: string;
  readonly locale: LocaleCode;
  readonly namespace: string;
  readonly entries: Readonly<Record<string, string>>;
}

export interface TranslatableText {
  readonly key: string;
  readonly defaultText: string;
  readonly fallbackLocale: LocaleCode;
  readonly values?: Readonly<Record<string, string | number>>;
}
