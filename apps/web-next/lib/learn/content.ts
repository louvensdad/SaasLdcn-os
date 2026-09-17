import type { Locale } from '@/lib/i18n/locales';

import { GUIDES_A as EN_A } from './guides/en-US.a';
import { GUIDES_B as EN_B } from './guides/en-US.b';
import { GUIDES_A as PT_A } from './guides/pt-BR.a';
import { GUIDES_B as PT_B } from './guides/pt-BR.b';
import { SIGNAL_MEANINGS } from './signals';
import { TERMS } from './terms';
import type { Guide, SignalMeaning, Term } from './types';

const EN: readonly Guide[] = [...EN_A, ...EN_B];
const PT: readonly Guide[] = [...PT_A, ...PT_B];

/** Guides are written in Portuguese and English. Spanish and French show the English text and say so on screen. */
export function guidesFor(locale: Locale): { readonly guides: readonly Guide[]; readonly native: boolean } {
  if (locale === 'pt-BR') return { guides: PT, native: true };
  return { guides: EN, native: locale === 'en-US' };
}

export function guideFor(locale: Locale, id: string): Guide | null {
  return guidesFor(locale).guides.find((guide) => guide.id === id) ?? null;
}

export function termsFor(locale: Locale): readonly Term[] {
  return TERMS[locale];
}

export function signalsFor(locale: Locale): readonly SignalMeaning[] {
  return SIGNAL_MEANINGS[locale];
}

/** Every guide id exists in both written languages (checked in development and by the e2e suite). */
export const GUIDE_IDS: readonly string[] = EN.map((guide) => guide.id);
