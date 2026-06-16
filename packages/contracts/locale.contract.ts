export type LocaleCode = 'pt-BR' | 'en-US' | 'es-ES' | 'fr-FR';
export type TranslationKey = string;

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
  readonly entries: Readonly<Record<TranslationKey, string>>;
  readonly fallbackLocale: LocaleCode;
  readonly missingKeys?: readonly TranslationKey[];
}

export interface LocalizedText {
  readonly key: TranslationKey;
  readonly defaultText: string;
  readonly fallbackLocale: LocaleCode;
  readonly values?: Readonly<Record<string, string | number>>;
}

export type TranslatableText = LocalizedText;

export interface LocalePreference {
  readonly interfaceLocale: LocaleCode;
  readonly generatedProjectLocale: LocaleCode;
  readonly documentationLocale: LocaleCode;
  readonly codeCommentsLocale: LocaleCode;
  readonly fallbackLocale: LocaleCode;
}

export interface GeneratedProjectLocaleProfile {
  readonly selected_locale: LocaleCode;
  readonly fallback_locale: LocaleCode;
  readonly generated_docs_locale: LocaleCode;
  readonly generated_readme_locale: LocaleCode;
  readonly generated_comments_locale: LocaleCode;
}

export interface LocalizationPreviewRequest {
  readonly locale: LocaleCode;
  readonly key: TranslationKey;
  readonly values?: Readonly<Record<string, string | number>>;
  readonly fallback_locale?: LocaleCode;
}

export interface LocalizationPreviewResponse {
  readonly requested_locale: LocaleCode;
  readonly resolved_locale: LocaleCode;
  readonly key: TranslationKey;
  readonly text: string;
  readonly used_fallback: boolean;
}

export interface LocalizationValidationResponse {
  readonly locale: LocaleCode;
  readonly valid: boolean;
  readonly total_keys: number;
  readonly missing_keys: readonly TranslationKey[];
  readonly fallback_keys: readonly TranslationKey[];
}
