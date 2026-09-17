import type { Locale } from '../locales';
import enUS from './en-US';
import esES from './es-ES';
import frFR from './fr-FR';
import ptBR from './pt-BR';

/** en-US defines the keys; every other locale must provide exactly the same keys (checked by the compiler). */
export type MessageKey = keyof typeof enUS;
export type Messages = Readonly<Record<MessageKey, string>>;

export const MESSAGES: Readonly<Record<Locale, Messages>> = {
  'en-US': enUS,
  'pt-BR': ptBR,
  'es-ES': esES,
  'fr-FR': frFR,
};
